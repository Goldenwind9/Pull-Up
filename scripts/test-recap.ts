// Run: npx tsx scripts/test-recap.ts   (then open out/*.jpg)
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import {
  buildRecap,
  rerenderRecap,
  recapKeys,
  pickPhotos,
  formatPeriodLabel,
  NoPhotosError,
  CARD_HEIGHT,
  CARD_WIDTH,
  type RecapDeps,
  type RecapPhoto,
} from "@/lib/agents/recap";

// ---------- fake data ----------

const COLORS = [
  [220, 80, 80],
  [80, 160, 220],
  [90, 190, 120],
  [230, 190, 60],
  [160, 100, 210],
  [240, 140, 70],
];

// A solid-color "photo". Alternates portrait and landscape to exercise cropping.
async function makePhotoBytes(i: number, portrait: boolean): Promise<Buffer> {
  const [r, g, b] = COLORS[i % COLORS.length];
  return sharp({
    create: { width: portrait ? 1500 : 2000, height: portrait ? 2000 : 1500, channels: 3, background: { r, g, b } },
  })
    .jpeg()
    .toBuffer();
}

const makePhotos = (n: number): RecapPhoto[] =>
  Array.from({ length: n }, (_, i) => ({
    proofId: `p${i + 1}`,
    questId: `q${i + 1}`,
    photoKey: `photos/q${i + 1}.jpg`,
    questTitle: `Quest ${i + 1}`,
    placeName: `Place ${i + 1}`,
    caption: `Original caption ${i + 1}`,
    takenAt: `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
    confidence: 0.9,
  }));

const validReply = (n: number) =>
  JSON.stringify({
    title: "The Great Taco Heist",
    captions: Array.from({ length: n }, (_, i) => `Caption ${i + 1}: a playful line to prove wrapping works`),
  });

// Builds fake versions of everything with side effects (model, storage).
async function makeDeps(opts: { photos: RecapPhoto[]; replies: string[]; missing?: number[]; garbage?: number[] }) {
  const stored = new Map<string, Buffer>(); // fake object storage
  for (const [i, photo] of opts.photos.entries()) {
    if (opts.missing?.includes(i)) continue; // simulate a photo that vanished from storage
    stored.set(
      photo.photoKey,
      opts.garbage?.includes(i) ? Buffer.from("this is not an image") : await makePhotoBytes(i, i % 2 === 0),
    );
  }
  const prompts: string[] = []; // every prompt the "model" received
  let calls = 0;
  const deps: RecapDeps = {
    loadInput: async () => ({
      crewName: "The Midnight Snackers",
      photos: opts.photos,
      stats: { questsDone: opts.photos.length, photos: opts.photos.length + 2, votes: 11 },
    }),
    completeJson: async (_system, user) => {
      prompts.push(user);
      return opts.replies[Math.min(calls++, opts.replies.length - 1)];
    },
    putObject: async (key, body) => {
      stored.set(key, body);
    },
    getObject: async (key) => {
      const body = stored.get(key);
      if (!body) throw new Error(`not found: ${key}`);
      return body;
    },
  };
  return { deps, stored, prompts };
}

// Checks the card is a real 1080x1920 image, and saves it to ./out so you can look at it.
async function assertCard(card: Buffer | undefined, file: string) {
  assert.ok(card && card.length > 10_000, "card should be a real image");
  const meta = await sharp(card).metadata();
  assert.equal(meta.width, CARD_WIDTH);
  assert.equal(meta.height, CARD_HEIGHT);
  await mkdir("out", { recursive: true });
  await writeFile(`out/${file}`, card);
}

// ---------- the tests: one entry per scenario ----------

const scenarios: Record<string, () => Promise<void>> = {
  async "happy path"() {
    const photos = makePhotos(4);
    const { deps, stored, prompts } = await makeDeps({ photos, replies: [validReply(4)] });
    const result = await buildRecap("crew-1", "recap-1", deps);
    assert.equal(prompts.length, 1);
    assert.equal(result.imageKey, "recaps/crew-1/recap-1/card.jpg");
    assert.equal(result.script.title, "The Great Taco Heist");
    assert.deepEqual(result.photoKeys, photos.map((p) => p.photoKey));
    assert.equal(result.periodStart, "2026-10-01T12:00:00.000Z");
    assert.equal(result.periodEnd, "2026-10-04T12:00:00.000Z");
    await assertCard(stored.get(result.imageKey), "recap-happy.jpg");
  },

  async "every collage size from 1 to 9 photos renders"() {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const { deps, stored } = await makeDeps({ photos: makePhotos(n), replies: [validReply(n)] });
      const result = await buildRecap("crew-1", "recap-1", deps);
      await assertCard(stored.get(result.imageKey), `recap-${n}-photos.jpg`);
    }
  },

  async "more than 9 quests: 9 are shown, but every photo is claimed"() {
    const { deps } = await makeDeps({ photos: makePhotos(12), replies: [validReply(9)] });
    const result = await buildRecap("crew-1", "recap-1", deps);
    assert.equal(result.photoKeys.length, 9);
    assert.equal(result.proofIds.length, 12);
    assert.equal(result.periodEnd, "2026-10-12T12:00:00.000Z");
  },

  async "photos are sampled evenly across the period"() {
    const ids = pickPhotos(makePhotos(12)).map((p) => p.questId);
    assert.deepEqual(ids, ["q1", "q2", "q4", "q5", "q7", "q8", "q9", "q11", "q12"]);
  },

  async "only one photo per quest, the most confident one"() {
    const [a] = makePhotos(1);
    const picked = pickPhotos([
      { ...a, proofId: "low", photoKey: "photos/low.jpg", confidence: 0.6 },
      { ...a, proofId: "high", photoKey: "photos/high.jpg", confidence: 0.95 },
    ]);
    assert.deepEqual(picked.map((p) => p.photoKey), ["photos/high.jpg"]);
  },

  async "no unused photos -> NoPhotosError"() {
    const { deps } = await makeDeps({ photos: [], replies: [validReply(0)] });
    await assert.rejects(buildRecap("crew-1", "recap-1", deps), NoPhotosError);
  },

  async "date range label"() {
    assert.equal(formatPeriodLabel("2026-10-03T10:00:00Z", "2026-10-28T10:00:00Z"), "October 2026");
    assert.equal(formatPeriodLabel("2026-10-03T10:00:00Z", "2026-11-12T10:00:00Z"), "Oct 3 – Nov 12, 2026");
    assert.equal(formatPeriodLabel("2026-12-20T10:00:00Z", "2027-01-05T10:00:00Z"), "Dec 20, 2026 – Jan 5, 2027");
  },

  async "a second recap never overwrites the first"() {
    const { deps, stored } = await makeDeps({ photos: makePhotos(4), replies: [validReply(4)] });
    await buildRecap("crew-1", "recap-1", deps);
    await buildRecap("crew-1", "recap-2", deps);
    const first = recapKeys("crew-1", "recap-1");
    const second = recapKeys("crew-1", "recap-2");
    assert.notEqual(first.card, second.card);
    for (const key of [first.card, first.manifest, second.card, second.manifest]) {
      assert.ok(stored.has(key), `${key} should exist`);
    }
  },

  async "bad JSON then good JSON uses the retry"() {
    const { deps, prompts } = await makeDeps({ photos: makePhotos(4), replies: ["definitely not json", validReply(4)] });
    const result = await buildRecap("crew-1", "recap-1", deps);
    assert.equal(prompts.length, 2);
    assert.ok(prompts[1].includes("rejected"));
    assert.equal(result.script.title, "The Great Taco Heist");
  },

  async "wrong caption count is rejected and retried"() {
    const { deps, prompts } = await makeDeps({ photos: makePhotos(4), replies: [validReply(3), validReply(4)] });
    const result = await buildRecap("crew-1", "recap-1", deps);
    assert.equal(prompts.length, 2);
    assert.equal(result.script.captions.length, 4);
  },

  async "model always fails -> fallback uses the stored captions, card still produced"() {
    const { deps, stored, prompts } = await makeDeps({ photos: makePhotos(4), replies: ["garbage"] });
    const result = await buildRecap("crew-1", "recap-1", deps);
    assert.equal(prompts.length, 2);
    assert.equal(result.script.title, "Our Side Quest Recap");
    assert.equal(result.script.captions[0], "Original caption 1");
    await assertCard(stored.get(result.imageKey), "recap-fallback.jpg");
  },

  async "missing or corrupt photos become placeholders"() {
    const { deps, stored } = await makeDeps({
      photos: makePhotos(4),
      replies: [validReply(4)],
      missing: [1],
      garbage: [2],
    });
    const result = await buildRecap("crew-1", "recap-1", deps);
    await assertCard(stored.get(result.imageKey), "recap-bad-photos.jpg");
  },

  async "no readable photos at all is an error"() {
    const { deps } = await makeDeps({ photos: makePhotos(2), replies: [validReply(2)], missing: [0, 1] });
    await assert.rejects(buildRecap("crew-1", "recap-1", deps), /Could not read any/);
  },

  async "phone photos with a rotation flag are shown upright"() {
    // Stored as 2000x1500 with red on top and blue below, flagged "rotate 90 degrees clockwise".
    // Shown upright, red ends up on the RIGHT and blue on the LEFT.
    const red = await sharp({ create: { width: 2000, height: 750, channels: 3, background: { r: 220, g: 30, b: 30 } } })
      .png()
      .toBuffer();
    const flagged = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: { r: 30, g: 30, b: 220 } } })
      .composite([{ input: red, left: 0, top: 0 }])
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();

    const photos = makePhotos(1);
    const { deps, stored } = await makeDeps({ photos, replies: [validReply(1)] });
    stored.set(photos[0].photoKey, flagged);
    const result = await buildRecap("crew-1", "recap-1", deps);
    const card = stored.get(result.imageKey);
    await assertCard(card, "recap-rotation.jpg");

    const pixel = async (left: number, top: number) =>
      sharp(card).extract({ left, top, width: 1, height: 1 }).raw().toBuffer(); // [r, g, b]
    const leftSide = await pixel(200, 900);
    const rightSide = await pixel(880, 900);
    assert.ok(leftSide[2] > leftSide[0], "left side should be blue");
    assert.ok(rightSide[0] > rightSide[2], "right side should be red");
  },

  async "rerender reuses the stored photos and makes no model calls"() {
    const photos = makePhotos(4);
    const { deps, stored, prompts } = await makeDeps({ photos, replies: [validReply(4)] });
    const built = await buildRecap("crew-1", "recap-1", deps);
    assert.equal(prompts.length, 1);

    const keys = recapKeys("crew-1", "recap-1");
    assert.deepEqual([...stored.keys()].sort(), [...photos.map((p) => p.photoKey), keys.card, keys.manifest].sort());

    stored.delete(built.imageKey); // prove the card is really redrawn, not just left over
    const again = await rerenderRecap("crew-1", "recap-1", deps);
    assert.equal(prompts.length, 1, "rerender must not call the model");
    assert.equal(again.periodStart, built.periodStart);
    await assertCard(stored.get(again.imageKey), "recap-rerender.jpg");
  },

  async "rerender without a stored recap fails with a clear message"() {
    const { deps } = await makeDeps({ photos: makePhotos(4), replies: [validReply(4)] });
    await assert.rejects(rerenderRecap("crew-1", "recap-1", deps), /run buildRecap first/);
  },

  async "unsafe ids are rejected before any work happens"() {
    const { deps } = await makeDeps({ photos: makePhotos(4), replies: [validReply(4)] });
    await assert.rejects(buildRecap("../etc", "recap-1", deps), /crewId/);
    await assert.rejects(buildRecap("crew-1", "../x", deps), /recapId/);
    await assert.rejects(rerenderRecap("crew-1", "a/b", deps), /recapId/);
  },
};

// ---------- runner: runs every scenario above and prints PASS / FAIL ----------

async function main() {
  let failed = 0;
  for (const [name, run] of Object.entries(scenarios)) {
    try {
      await run();
      console.log(`PASS  ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL  ${name}\n`, error);
    }
  }
  console.log(failed ? `\n${failed} scenario(s) failed` : "\nAll scenarios passed. Open the files in ./out to check the layouts.");
  process.exitCode = failed ? 1 : 0;
}

void main();