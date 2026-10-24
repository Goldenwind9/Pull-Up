// Shared model client. Every AI call goes through here, so switching between
// Muse Spark and a fallback model is an env change, not a code change.
import OpenAI from "openai";

export const ai = new OpenAI({
  baseURL: process.env.AI_BASE_URL, // https://api.meta.ai/v1
  apiKey: process.env.AI_API_KEY,
});

export const MODEL = process.env.AI_MODEL ?? "muse-spark-1.1";

export const DEMO_MODE = process.env.DEMO_MODE === "true";
