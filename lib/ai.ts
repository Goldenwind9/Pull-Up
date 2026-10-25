// Shared model client. Every AI call goes through here, so switching between
// Muse Spark and a fallback model is an env change, not a code change.
import OpenAI from "openai";

export const ai = new OpenAI({
  baseURL: process.env.AI_BASE_URL, // https://api.meta.ai/v1
  apiKey: process.env.AI_API_KEY,
});

export const MODEL = process.env.AI_MODEL ?? "muse-spark-1.1";

export const DEMO_MODE = process.env.DEMO_MODE === "true";

/**
 * How hard the photo checker looks (PROOF_CHECK in .env):
 * - "strict" (default): the photo must match the quest and place.
 * - "lenient": testing mode, any genuine photo loosely tied to the quest passes, location ignored.
 * - "off": every photo passes; the model only writes the caption.
 */
export type ProofCheckMode = "strict" | "lenient" | "off";

export function proofCheckMode(): ProofCheckMode {
  const mode = (process.env.PROOF_CHECK ?? "strict").toLowerCase();
  return mode === "lenient" || mode === "off" ? mode : "strict";
}
