// Run: npx tsx scripts/test-recap.ts   (then open out/*.jpg)
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import {
  buildRecap,
  rerenderRecap,
  recapKeys,
  pickBeats,
  CARD_HEIGHT,
  CARD_WIDTH,
  type RecapDeps,
  type RecapInput,
  type RecapQuest,
} from "@/lib/agents/recap";
import type { ImageProvider } from "@/lib/recap/images";

// ---------- fake data ----------

const makeQuests = (n: number): RecapQuest[] =>
  Array.from({ length: n }, (_, i) => ({
    title: `Quest ${i + 1}`,
    placeName: `Place ${i + 1}`,
    caption: `Caption ${i + 1}`,
    completedAt: `2026-10-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
  }));

const makeInput = (n: number): RecapInput => ({
  crewName: "The Midnight Snackers",
  quests: makeQuests(n),
  stats: { questsDone: n, photos: n + 2, votes: 11 },
});

// What a well-behaved model would reply. failPanel2 makes panel 2's image request fail.
const validScript = (failPanel2 = false) =>
  JSON.stringify({
    title: "The Great Taco Heist",
    panels: [1, 2, 3, 4].map((n) => ({
      scene: `Panel ${n} scene${failPanel2 && n === 2 ? " FAIL" : ""}`,
      dialogue: `Line ${n}: a reasonably long line of dialogue to prove the wrapping works properly.`,
    })),
  });

// A fake image model: returns a flat blue picture, or throws if the prompt contains "FAIL".
const fakeImages: ImageProvider = {
  name: "fake",
  async generate(prompt) {
    if (prompt.includes("FAIL")) throw new Error("simulated provider failure");
    return sharp({ create: { width: 768, height: 1024, channels: 3, background: { r: 60, g: 140, b: 220 } } })
      .png()
      .toBuffer();
  },
};

// Builds fake versions of everything with side effects (model, images, storage).
function makeDeps(opts: { input: RecapInput; replies: string[]; image?: ImageProvider | null }) {
  const stored = new Map<string, Buffer>(); // fake object storage
  const prompts: string[] = []; // every prompt the "model" received
  let calls = 0;
  const deps: RecapDeps = {
    loadInput: async () => opts.input,
    completeJson: async (_system, user) => {
      prompts.push(user);
      return opts.replies[Math.min(calls++, opts.replies.length - 1)];
    },
    image: opts.image === undefined ? fakeImages : opts.image,
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
    const { deps, stored, prompts } = makeDeps({ input: makeInput(4), replies: [validScript()] });
    const result = await buildRecap("crew-1", "2026-10-01", "2026-10-31", deps);
    assert.equal(prompts.length, 1);
    assert.equal(result.imageKey, "recaps/crew-1/2026-10-01/card.jpg");
    assert.equal(result.script.title, "The Great Taco Heist");
    await assertCard(stored.get(result.imageKey), "recap-happy.jpg");
  },

  async "fewer than 4 quests are padded with hangout beats"() {
    const { deps, prompts } = makeDeps({ input: makeInput(2), replies: [validScript()] });
    await buildRecap("crew-1", "2026-10-01", "2026-10-31", deps);
    assert.equal(prompts[0].match(/"kind":"hangout"/g)?.length, 2);
  },

  async "more than 4 quests are sampled evenly across the month"() {
    const titles = pickBeats(makeQuests(9)).map((b) => (b.kind === "quest" ? b.title : "hangout"));
    assert.deepEqual(titles, ["Quest 1", "Quest 4", "Quest 6", "Quest 9"]);
  },

  async "bad JSON then good JSON uses the retry"() {
    const { deps, prompts } = makeDeps({ input: makeInput(4), replies: ["definitely not json", validScript()] });
    const result = await buildRecap("crew-1", "2026-10-01", "2026-10-31", deps);
    assert.equal(prompts.length, 2);
    assert.ok(prompts[1].includes("rejected"));
    assert.equal(result.script.title, "The Great Taco Heist");
  },

  async "model always fails -> fallback script, card still produced"() {
    const { deps, stored, prompts } = makeDeps({ input: makeInput(4), replies: ["garbage"] });
    const result = await buildRecap("crew-1", "2026-10-01", "2026-10-31", deps);
    assert.equal(prompts.length, 2);
    assert.ok(result.script.title.includes("Midnight Snackers"));
    await assertCard(stored.get(result.imageKey), "recap-fallback.jpg");
  },

  async "a failing panel and a missing provider both degrade to placeholders"() {
    const flaky = makeDeps({ input: makeInput(4), replies: [validScript(true)] });
    const r1 = await buildRecap("crew-1", "2026-10-01", "2026-10-31", flaky.deps);
    await assertCard(flaky.stored.get(r1.imageKey), "recap-one-bad-panel.jpg");
    // A failed panel must not leave a file behind.
    assert.equal(flaky.stored.has(recapKeys("crew-1", "2026-10-01").panel(1)), false);

    const none = makeDeps({ input: makeInput(4), replies: [validScript()], image: null });
    const r2 = await buildRecap("crew-1", "2026-10-01", "2026-10-31", none.deps);
    await assertCard(none.stored.get(r2.imageKey), "recap-no-provider.jpg");
  },

  async "invalid arguments are rejected before any work happens"() {
    const { deps } = makeDeps({ input: makeInput(4), replies: [validScript()] });
    await assert.rejects(buildRecap("crew-1", "2026-10-31", "2026-10-01", deps), /after/);
    await assert.rejects(buildRecap("crew-1", "Oct 1", "2026-10-31", deps), /YYYY-MM-DD/);
    await assert.rejects(buildRecap("../etc", "2026-10-01", "2026-10-31", deps), /crewId/);
  },

  async "rerender reuses stored panels and makes no AI calls"() {
    let imageCalls = 0;
    const counting: ImageProvider = {
      name: "counting",
      generate: (prompt) => {
        imageCalls++;
        return fakeImages.generate(prompt);
      },
    };
    const { deps, stored, prompts } = makeDeps({ input: makeInput(4), replies: [validScript()], image: counting });
    const built = await buildRecap("crew-1", "2026-10-01", "2026-10-31", deps);
    assert.equal(imageCalls, 4);
    assert.equal(prompts.length, 1);

    const keys = recapKeys("crew-1", "2026-10-01");
    assert.deepEqual(
      [...stored.keys()].sort(),
      [keys.card, keys.manifest, keys.panel(0), keys.panel(1), keys.panel(2), keys.panel(3)].sort(),
    );

    stored.delete(built.imageKey); // prove the card is really redrawn, not just left over
    const again = await rerenderRecap("crew-1", "2026-10-01", deps);
    assert.equal(imageCalls, 4, "rerender must not call the image provider");
    assert.equal(prompts.length, 1, "rerender must not call the model");
    await assertCard(stored.get(again.imageKey), "recap-rerender.jpg");
  },

  async "rerender without a stored recap fails with a clear message"() {
    const { deps } = makeDeps({ input: makeInput(4), replies: [validScript()] });
    await assert.rejects(rerenderRecap("crew-1", "2026-10-01", deps), /run buildRecap first/);
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
  console.log(failed ? `\n${failed} scenario(s) failed` : "\nAll scenarios passed. Open the files in ./out to check the layout.");
  process.exitCode = failed ? 1 : 0;
}

void main();