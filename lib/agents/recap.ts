// Recap writer: a crew's unused photos -> title + captions from Muse Spark -> collage card.
// Owner: AI (script), Frontend helps with the card layout.
import { z } from "zod";
import { CARD_HEIGHT, CARD_WIDTH, MAX_TILES, renderRecapCard } from "@/lib/recap/card";
import { RECAP_SCRIPT_PROMPT, recapScriptUserPrompt } from "@/lib/prompts/recap";

export { CARD_HEIGHT, CARD_WIDTH };

/** One accepted, not-yet-used proof photo. Implemented in lib/recap/loadInput.ts as getRecapInput. */
export type RecapPhoto = {
  proofId: string; // proofs.id, claimed when the recap is saved
  questId: string;
  photoKey: string; // proofs.photo_key (the original upload in object storage)
  questTitle: string;
  placeName: string;
  caption: string | null; // the caption verifyProof wrote
  takenAt: string; // ISO timestamp (proofs.created_at)
  confidence: number; // proofs.confidence, used to pick one photo per quest
};
export type RecapStats = { questsDone: number; photos: number; votes: number };
export type RecapInput = {
  crewName: string;
  photos: RecapPhoto[]; // every unused accepted proof for the crew
  stats: RecapStats; // for the same stretch of time as the photos
};

const scriptSchema = (photoCount: number) =>
  z.object({
    title: z.string().trim().min(1).max(60),
    captions: z.array(z.string().trim().min(1).max(100)).length(photoCount),
  });
export type RecapScript = { title: string; captions: string[] };

/** Everything needed to redraw the card without any AI call. Stored as manifest.json. */
const RecapManifest = z
  .object({
    version: z.literal(3),
    recapId: z.string(),
    crewName: z.string(),
    periodStart: z.string(), // ISO timestamp of the earliest photo
    periodEnd: z.string(), // ISO timestamp of the latest photo
    script: z.object({ title: z.string(), captions: z.array(z.string()) }),
    stats: z.object({ questsDone: z.number(), photos: z.number(), votes: z.number() }),
    photoKeys: z.array(z.string()).min(1).max(MAX_TILES),
  })
  .refine((m) => m.script.captions.length === m.photoKeys.length, {
    message: "captions and photoKeys differ in length",
  });
export type RecapManifest = z.infer<typeof RecapManifest>;

export type RecapResult = {
  recapId: string;
  imageKey: string;
  manifestKey: string;
  photoKeys: string[]; // the photos shown on the card
  script: RecapScript;
  periodStart: string; // store in recaps.period_start
  periodEnd: string; // store in recaps.period_end
  proofIds: string[]; // EVERY photo that went into this recap's period: mark all of them as used
};
export type RerenderResult = Omit<RecapResult, "proofIds">;

/** Thrown when the crew has no unused accepted photos (the route should answer 409, not 500). */
export class NoPhotosError extends Error {
  constructor(crewId: string) {
    super(`No new photos for crew ${crewId} since the last recap`);
    this.name = "NoPhotosError";
  }
}

/** Object-storage keys for one recap. Deterministic, so nothing needs to be saved in the database. */
export function recapKeys(crewId: string, recapId: string) {
  const prefix = `recaps/${crewId}/${recapId}`;
  return { card: `${prefix}/card.jpg`, manifest: `${prefix}/manifest.json` };
}

/** Everything with side effects, injectable so tests need no network, DB, or keys. */
export type RecapDeps = {
  loadInput(crewId: string): Promise<RecapInput>;
  completeJson(system: string, user: string): Promise<string>;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
};

const SCRIPT_ATTEMPTS = 2;
const SCRIPT_TIMEOUT_MS = 60_000;

function assertSafeId(name: string, value: string): void {
  if (!/^[\w-]+$/.test(value)) throw new Error(`Invalid ${name}`);
}

function timeOf(iso: string): number {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) throw new Error(`Invalid timestamp: ${iso}`);
  return time;
}

/** "October 2026", "Oct 3 – Nov 12, 2026", or "Dec 20, 2026 – Jan 5, 2027". Dates are in UTC. */
export function formatPeriodLabel(startIso: string, endIso: string): string {
  const start = new Date(timeOf(startIso));
  const end = new Date(timeOf(endIso));
  const fmt = (date: Date, options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  if (sameYear && start.getUTCMonth() === end.getUTCMonth()) return fmt(end, { month: "long", year: "numeric" });
  if (sameYear) {
    return `${fmt(start, { month: "short", day: "numeric" })} – ${fmt(end, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  const full: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${fmt(start, full)} – ${fmt(end, full)}`;
}

/** One photo per quest (most confident, earliest on ties), in date order, evenly sampled down to MAX_TILES. */
export function pickPhotos(photos: RecapPhoto[]): RecapPhoto[] {
  const best = new Map<string, RecapPhoto>();
  for (const photo of photos) {
    const current = best.get(photo.questId);
    if (
      !current ||
      photo.confidence > current.confidence ||
      (photo.confidence === current.confidence && timeOf(photo.takenAt) < timeOf(current.takenAt))
    ) {
      best.set(photo.questId, photo);
    }
  }
  const sorted = [...best.values()].sort((a, b) => timeOf(a.takenAt) - timeOf(b.takenAt));
  if (sorted.length <= MAX_TILES) return sorted;
  return Array.from({ length: MAX_TILES }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (MAX_TILES - 1))]);
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model reply");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Used when the model fails: the captions verifyProof already wrote. Never throws. */
function fallbackScript(photos: RecapPhoto[]): RecapScript {
  return {
    title: "Our Side Quest Recap",
    captions: photos.map((p) => (p.caption?.trim() || p.questTitle.trim() || "Pulled up!").slice(0, 100)),
  };
}

async function writeScript(deps: RecapDeps, crewName: string, photos: RecapPhoto[]): Promise<RecapScript> {
  const schema = scriptSchema(photos.length);
  const prompt = recapScriptUserPrompt(crewName, photos);
  let feedback = "";
  for (let attempt = 1; attempt <= SCRIPT_ATTEMPTS; attempt++) {
    try {
      const raw = await deps.completeJson(RECAP_SCRIPT_PROMPT, prompt + feedback);
      return schema.parse(extractJson(raw));
    } catch (error) {
      const reason = (
        error instanceof z.ZodError
          ? error.issues.map((issue) => `${issue.path.join(".") || "reply"}: ${issue.message}`).join("; ")
          : error instanceof Error
            ? error.message
            : String(error)
      ).slice(0, 300);      feedback = `\n\nYour previous reply was rejected (${reason}). Reply with ONLY the JSON object, with exactly ${photos.length} captions.`;
    }
  }
  return fallbackScript(photos);
}

/** Downloads the photos. An unreadable one becomes null (placeholder tile); none readable at all is an error. */
async function loadPhotos(deps: RecapDeps, keys: string[]): Promise<(Buffer | null)[]> {
  const results = await Promise.allSettled(keys.map((key) => deps.getObject(key)));
  const images = results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[recap] photo ${i + 1} (${keys[i]}) unreadable, using placeholder:`, result.reason);
    return null;
  });
  if (images.every((image) => image === null)) throw new Error("Could not read any recap photos from storage");
  return images;
}

function renderCard(manifest: RecapManifest, images: (Buffer | null)[]): Promise<Buffer> {
  return renderRecapCard({
    title: manifest.script.title,
    crewName: manifest.crewName,
    periodLabel: formatPeriodLabel(manifest.periodStart, manifest.periodEnd),
    stats: manifest.stats,
    tiles: manifest.script.captions.map((caption, i) => ({ image: images[i], caption })),
  });
}

async function defaultDeps(): Promise<RecapDeps> {
  // Lazy imports: lib/ai throws at import time when AI_API_KEY is unset.
  const [{ ai, MODEL }, storage, recapInput] = await Promise.all([
    import("@/lib/ai"),
    import("@/lib/storage"),
    import("@/lib/recap/loadInput"),
  ]);
  return {
    loadInput: recapInput.getRecapInput,
    completeJson: async (system, user) => {
      const res = await ai.chat.completions.create(
        {
          model: MODEL,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
        { timeout: SCRIPT_TIMEOUT_MS },
      );
      return res.choices[0]?.message?.content ?? "";
    },
    putObject: async (key, body, contentType) => {
      // storage.putObject returns a string we don't need: our keys are deterministic (see recapKeys).
      await storage.putObject(key, body, contentType);
    },
    getObject: (key) => storage.getObject(key),
  };
}

/**
 * Builds a recap from the crew's unused photos and stores the card + manifest.
 * It does NOT touch the database. The caller must then call saveRecap() (lib/recap/saveRecap.ts) with the
 * result, which records the recap and marks the photos as used in one transaction.
 */
export async function buildRecap(crewId: string, recapId: string, deps?: RecapDeps): Promise<RecapResult> {
  assertSafeId("crewId", crewId);
  assertSafeId("recapId", recapId);
  const d = deps ?? (await defaultDeps());

  const input = await d.loadInput(crewId);
  if (input.photos.length === 0) throw new NoPhotosError(crewId);

  const photos = pickPhotos(input.photos);
  const times = input.photos.map((p) => timeOf(p.takenAt));
  const periodStart = new Date(Math.min(...times)).toISOString();
  const periodEnd = new Date(Math.max(...times)).toISOString();

  // The script never throws (it falls back), so the two jobs can run side by side.
  const [script, images] = await Promise.all([
    writeScript(d, input.crewName, photos),
    loadPhotos(
      d,
      photos.map((p) => p.photoKey),
    ),
  ]);

  const manifest: RecapManifest = {
    version: 3,
    recapId,
    crewName: input.crewName,
    periodStart,
    periodEnd,
    script,
    stats: input.stats,
    photoKeys: photos.map((p) => p.photoKey),
  };

  const keys = recapKeys(crewId, recapId);
  const card = await renderCard(manifest, images);
  await Promise.all([
    d.putObject(keys.card, card, "image/jpeg"),
    d.putObject(keys.manifest, Buffer.from(JSON.stringify(manifest)), "application/json"),
  ]);

  return {
    recapId,
    imageKey: keys.card,
    manifestKey: keys.manifest,
    photoKeys: manifest.photoKeys,
    script,
    periodStart,
    periodEnd,
    proofIds: input.photos.map((p) => p.proofId),
  };
}

/**
 * Redraws an existing recap's card from its manifest and the original photos. No AI calls, no database:
 * free and fast. Use after changing the layout in lib/recap/card.ts.
 */
export async function rerenderRecap(crewId: string, recapId: string, deps?: RecapDeps): Promise<RerenderResult> {
  assertSafeId("crewId", crewId);
  assertSafeId("recapId", recapId);
  const d = deps ?? (await defaultDeps());
  const keys = recapKeys(crewId, recapId);

  let manifest: RecapManifest;
  try {
    manifest = RecapManifest.parse(JSON.parse((await d.getObject(keys.manifest)).toString("utf8")));
  } catch (error) {
    throw new Error(`No usable stored recap ${recapId} for crew ${crewId}; run buildRecap first.`, { cause: error });
  }

  const images = await loadPhotos(d, manifest.photoKeys);
  const card = await renderCard(manifest, images);
  await d.putObject(keys.card, card, "image/jpeg");
  return {
    recapId,
    imageKey: keys.card,
    manifestKey: keys.manifest,
    photoKeys: manifest.photoKeys,
    script: manifest.script,
    periodStart: manifest.periodStart,
    periodEnd: manifest.periodEnd,
  };
}