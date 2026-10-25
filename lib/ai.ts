// Shared model client. Every AI call goes through here, so switching between
// Muse Spark and a fallback model is an env change, not a code change.
import OpenAI from "openai";

export const MODEL = process.env.AI_MODEL ?? "muse-spark-1.2";
// Used for the last retry when MODEL keeps coming back "not found" (see museFetch).
export const FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL ?? "muse-spark-1.2";

const NOT_FOUND_RETRIES = 2;

/**
 * Muse sometimes answers 404 model_not_found for a model it does serve: about 1 call in 12
 * for muse-spark-1.1 on 2026-10-24, which broke "Pull up" with a 500. The SDK doesn't retry
 * 404s, so this does, for every call site at once. The last retry swaps MODEL for
 * FALLBACK_MODEL; requests for other models (e.g. muse-image) are only retried as-is.
 */
async function museFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 404 || attempt >= NOT_FOUND_RETRIES) return res;
    if (!(await res.clone().text()).includes("model_not_found")) return res;

    let body = init?.body;
    if (attempt === NOT_FOUND_RETRIES - 1 && typeof body === "string" && FALLBACK_MODEL !== MODEL) {
      try {
        const json = JSON.parse(body);
        if (json.model === MODEL) body = JSON.stringify({ ...json, model: FALLBACK_MODEL });
      } catch {
        // Not JSON: retry unchanged.
      }
    }
    console.warn(`[ai] model_not_found (attempt ${attempt + 1}), retrying${body !== init?.body ? ` with ${FALLBACK_MODEL}` : ""}`);
    init = { ...init, body };
  }
}

export const ai = new OpenAI({
  baseURL: process.env.AI_BASE_URL, // https://api.meta.ai/v1
  apiKey: process.env.AI_API_KEY,
  fetch: museFetch,
});

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
