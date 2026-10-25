// Recap writer: month of quests -> 4-panel comic script -> panel images -> 1080x1920 card.
// Owner: AI (script + images), Frontend helps with the card layout.
import sharp from "sharp";
import { z } from "zod";
import { CARD_HEIGHT, CARD_WIDTH, renderRecapCard } from "@/lib/recap/card";
import type { ImageProvider } from "@/lib/recap/images";
import { RECAP_SCRIPT_PROMPT, panelImagePrompt, recapScriptUserPrompt } from "@/lib/prompts/recap";


export { CARD_HEIGHT, CARD_WIDTH };

export const ComicScript = z.object({
  title: z.string().trim().min(1).max(60),
  panels: z
    .array(
      z.object({
        scene: z.string().trim().min(1).max(400),
        dialogue: z.string().trim().min(1).max(140),
      }),
    )
    .length(4),
});
export type ComicScript = z.infer<typeof ComicScript>;

/** What the database layer must provide (implemented in lib/recap/loadInput.ts as getRecapInput). */
export type RecapQuest = {
  title: string;
  placeName: string;
  caption: string | null;
  completedAt: string; // ISO timestamp
};
export type RecapStats = { questsDone: number; photos: number; votes: number };
export type RecapInput = {
  crewName: string;
  quests: RecapQuest[]; // completed quests in the period
  stats: RecapStats; // from crew_weekly, summed over the period
};

export type RecapBeat =
  | { kind: "quest"; title: string; place: string; caption: string | null }
  | { kind: "hangout" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Everything needed to redraw the card without any AI call. Stored as manifest.json. */
const RecapManifest = z.object({
  version: z.literal(1),
  crewName: z.string(),
  periodStart: z.string().regex(ISO_DATE),
  periodEnd: z.string().regex(ISO_DATE),
  script: ComicScript,
  stats: z.object({ questsDone: z.number(), photos: z.number(), votes: z.number() }),
  panelKeys: z.array(z.string().nullable()).length(4), // null = the image failed, use a placeholder
});
export type RecapManifest = z.infer<typeof RecapManifest>;

export type RecapResult = {
  imageKey: string;
  manifestKey: string;
  panelKeys: (string | null)[];
  script: ComicScript;
};

/** Object-storage keys for one recap. Deterministic, so nothing needs to be saved in the database. */
export function recapKeys(crewId: string, periodStart: string) {
  const prefix = `recaps/${crewId}/${periodStart}`;
  return {
    card: `${prefix}/card.jpg`,
    manifest: `${prefix}/manifest.json`,
    panel: (index: number) => `${prefix}/panel-${index + 1}.jpg`,
  };
}

/** Everything with side effects, injectable so tests need no network, DB, or keys. */
export type RecapDeps = {
  loadInput(crewId: string, periodStart: string, periodEnd: string): Promise<RecapInput>;
  completeJson(system: string, user: string): Promise<string>;
  image: ImageProvider | null; // null => placeholder panels
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
};

const PANEL_COUNT = 4;
const SCRIPT_ATTEMPTS = 2;
const PANEL_ATTEMPTS = 2;
const SCRIPT_TIMEOUT_MS = 60_000;
const PANEL_TIMEOUT_MS = 60_000;

function assertCrewId(crewId: string): void {
  if (!/^[\w-]+$/.test(crewId)) throw new Error("Invalid crewId");
}

function assertDate(value: string, name: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be a YYYY-MM-DD date`);
  }
}

function formatPeriod(periodStart: string): string {
  return new Date(`${periodStart}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Up to 4 highlights spread evenly across the month; padded with "hangout" beats if fewer. */
export function pickBeats(quests: RecapQuest[]): RecapBeat[] {
  const sorted = [...quests].sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const chosen =
    sorted.length <= PANEL_COUNT
      ? sorted
      : Array.from({ length: PANEL_COUNT }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (PANEL_COUNT - 1))]);
  const beats: RecapBeat[] = chosen.map((q) => ({
    kind: "quest",
    title: q.title,
    place: q.placeName,
    caption: q.caption,
  }));
  while (beats.length < PANEL_COUNT) beats.push({ kind: "hangout" });
  return beats;
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model reply");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Deterministic script used when the model fails, so a recap is always produced. */
function fallbackScript(crewName: string, beats: RecapBeat[]): ComicScript {
  const lines = ["Okay, who's got the plan?", "I thought you had the plan!", "Best. Day. Ever.", "Same time next week?"];
  return ComicScript.parse({
    title: `${crewName}'s Month`.slice(0, 60),
    panels: beats.map((beat, i) => ({
      scene: (
        beat.kind === "quest"
          ? `A group of cartoon friends at ${beat.place}, having fun with: ${beat.title}`
          : "A group of cartoon friends relaxing together on a sofa, laughing"
      ).slice(0, 400),
      dialogue: lines[i % lines.length],
    })),
  });
}

async function writeScript(deps: RecapDeps, crewName: string, beats: RecapBeat[]): Promise<ComicScript> {
  const prompt = recapScriptUserPrompt(crewName, beats);
  let feedback = "";
  for (let attempt = 1; attempt <= SCRIPT_ATTEMPTS; attempt++) {
    try {
      const raw = await deps.completeJson(RECAP_SCRIPT_PROMPT, prompt + feedback);
      return ComicScript.parse(extractJson(raw));
    } catch (error) {
      const reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
      console.warn(`[recap] script attempt ${attempt}/${SCRIPT_ATTEMPTS} failed: ${reason}`);
      feedback = `\n\nYour previous reply was rejected (${reason}). Reply with ONLY the JSON object, with exactly 4 panels.`;
    }
  }
  try {
    return fallbackScript(crewName, beats);
  } catch {
    // A pathological crew name could break the title limit; use a safe title.
    return fallbackScript("Our", beats);
  }
}

/** One panel: generate, then normalize to JPEG. Normalizing also proves the bytes are a decodable image. */
async function drawPanel(provider: ImageProvider, prompt: string): Promise<Buffer> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PANEL_ATTEMPTS; attempt++) {
    try {
      const raw = await provider.generate(prompt, AbortSignal.timeout(PANEL_TIMEOUT_MS));
      return await sharp(raw).jpeg({ quality: 92 }).toBuffer();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** Draws all panels in parallel. A failed panel becomes null (the card renders a placeholder). */
async function drawPanels(provider: ImageProvider | null, script: ComicScript): Promise<(Buffer | null)[]> {
  if (!provider) return script.panels.map(() => null);
  const results = await Promise.allSettled(script.panels.map((p) => drawPanel(provider, panelImagePrompt(p.scene))));
  return results.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    console.warn(`[recap] panel ${i + 1} failed, using placeholder:`, result.reason);
    return null;
  });
}

function renderCard(manifest: RecapManifest, panels: (Buffer | null)[]): Promise<Buffer> {
  return renderRecapCard({
    title: manifest.script.title,
    crewName: manifest.crewName,
    periodLabel: formatPeriod(manifest.periodStart),
    stats: manifest.stats,
    panels: manifest.script.panels.map((panel, i) => ({ image: panels[i], dialogue: panel.dialogue })),
  });
}

async function defaultDeps(): Promise<RecapDeps> {
  // Lazy imports: lib/ai throws at import time when AI_API_KEY is unset, and the DB code is heavy.
  const [{ ai, MODEL }, storage, recapInput, images] = await Promise.all([
    import("@/lib/ai"),
    import("@/lib/storage"),
    import("@/lib/recap/loadInput"),
    import("@/lib/recap/images"),
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
    image: await images.createImageProvider(),
    putObject: async (key, body, contentType) => {
      // storage.putObject returns a string we don't need: our keys are deterministic (see recapKeys).
      await storage.putObject(key, body, contentType);
    },
    getObject: (key) => storage.getObject(key),
  };
}

/** Full pipeline: script -> panels -> card, and stores panels + manifest so the card can be redrawn later. */
export async function buildRecap(
  crewId: string,
  periodStart: string,
  periodEnd: string,
  deps?: RecapDeps,
): Promise<RecapResult> {
  assertCrewId(crewId);
  assertDate(periodStart, "periodStart");
  assertDate(periodEnd, "periodEnd");
  if (periodStart > periodEnd) throw new Error("periodStart must not be after periodEnd");
  const d = deps ?? (await defaultDeps());

  const input = await d.loadInput(crewId, periodStart, periodEnd);
  const script = await writeScript(d, input.crewName, pickBeats(input.quests));
  const panels = await drawPanels(d.image, script);

  const keys = recapKeys(crewId, periodStart);
  const manifest: RecapManifest = {
    version: 1,
    crewName: input.crewName,
    periodStart,
    periodEnd,
    script,
    stats: input.stats,
    panelKeys: panels.map((panel, i) => (panel ? keys.panel(i) : null)),
  };

  const card = await renderCard(manifest, panels);
  await Promise.all([
    d.putObject(keys.card, card, "image/jpeg"),
    d.putObject(keys.manifest, Buffer.from(JSON.stringify(manifest)), "application/json"),
    ...panels.flatMap((panel, i) => (panel ? [d.putObject(keys.panel(i), panel, "image/jpeg")] : [])),
  ]);

  return { imageKey: keys.card, manifestKey: keys.manifest, panelKeys: manifest.panelKeys, script };
}

/**
 * Redraws the card from stored panels + manifest. No AI calls, no database: free and fast.
 * Use after changing the layout in lib/recap/card.ts.
 */
export async function rerenderRecap(crewId: string, periodStart: string, deps?: RecapDeps): Promise<RecapResult> {
  assertCrewId(crewId);
  assertDate(periodStart, "periodStart");
  const d = deps ?? (await defaultDeps());
  const keys = recapKeys(crewId, periodStart);

  let manifest: RecapManifest;
  try {
    manifest = RecapManifest.parse(JSON.parse((await d.getObject(keys.manifest)).toString("utf8")));
  } catch (error) {
    throw new Error(`No usable stored recap for ${crewId} / ${periodStart}; run buildRecap first.`, { cause: error });
  }

  const panels = await Promise.all(
    manifest.panelKeys.map(async (key, i) => {
      if (!key) return null;
      try {
        return await d.getObject(key);
      } catch (error) {
        console.warn(`[recap] stored panel ${i + 1} unreadable, using placeholder:`, error);
        return null;
      }
    }),
  );

  const card = await renderCard(manifest, panels);
  await d.putObject(keys.card, card, "image/jpeg");
  return { imageKey: keys.card, manifestKey: keys.manifest, panelKeys: manifest.panelKeys, script: manifest.script };
}