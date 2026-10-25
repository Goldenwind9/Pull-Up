// Fun fact for a photo: Google Lens (via SerpApi) says what's in it, the model writes one line.
// Owner: AI. Runs in the background after an upload; never throws.
import sharp from "sharp";
import { lensMatches } from "@/lib/serp";
import { FUN_FACT_SYSTEM_PROMPT, funFactUserPrompt } from "@/lib/prompts/funFact";

const TIMEOUT_MS = 30_000;

/** `imageUrl` must be public for a few minutes (a signed storage link). Null when there's nothing fun to say. */
export async function funFactFor(input: { photo: Buffer; imageUrl: string; placeName: string }): Promise<string | null> {
  try {
    const matches = (await lensMatches(input.imageUrl)).filter((m) => m.title);
    if (!matches.length) return null;

    const { ai, MODEL } = await import("@/lib/ai");
    const thumb = await sharp(input.photo).resize({ width: 512, height: 512, fit: "inside" }).jpeg({ quality: 70 }).toBuffer();
    const res = await ai.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: FUN_FACT_SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: funFactUserPrompt({ placeName: input.placeName, matches }) },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${thumb.toString("base64")}` } },
            ],
          },
        ],
      },
      { timeout: TIMEOUT_MS },
    );
    const fact = (res.choices[0]?.message?.content ?? "").trim().replace(/^"|"$/g, "");
    if (!fact || /^none\.?$/i.test(fact)) return null;
    const words = fact.split(/\s+/);
    return words.length > 30 ? `${words.slice(0, 30).join(" ")}…` : fact;
  } catch (err) {
    console.warn("[funFact] skipped:", err instanceof Error ? err.message : err);
    return null;
  }
}
