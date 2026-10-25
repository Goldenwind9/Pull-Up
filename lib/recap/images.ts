// Image providers behind one interface, so the recap code never knows which model drew the panel.
import type OpenAI from "openai";

export interface ImageProvider {
  readonly name: string;
  generate(prompt: string, signal?: AbortSignal): Promise<Buffer>;
}

// Verify against current Gemini docs; override with IMAGE_MODEL.
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image";

type GeminiResponse = {
  candidates?: { content?: { parts?: { inlineData?: { data?: string } }[] } }[];
};

export class GeminiImageProvider implements ImageProvider {
  readonly name = "gemini";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(prompt: string, signal?: AbortSignal): Promise<Buffer> {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
        signal,
      },
    );
    if (!res.ok) {
      throw new Error(`Gemini image request failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    const json = (await res.json()) as GeminiResponse;
    const data = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
    if (!data) throw new Error("Gemini returned no image data");
    return Buffer.from(data, "base64");
  }
}

/**
 * UNVERIFIED: assumes Meta exposes an OpenAI-style images endpoint. Check Meta's docs
 * for Muse Image (endpoint, model name, response format) before relying on this.
 */
export class MuseImageProvider implements ImageProvider {
  readonly name = "muse";

  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
  ) {}

  async generate(prompt: string, signal?: AbortSignal): Promise<Buffer> {
    const res = await this.client.images.generate(
      { model: this.model, prompt, n: 1, response_format: "b64_json" },
      { signal },
    );
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) throw new Error("Muse Image returned no image data");
    return Buffer.from(b64, "base64");
  }
}

/** IMAGE_PROVIDER = gemini | muse | none (default). `none` means every panel is a placeholder. */
export async function createImageProvider(env: NodeJS.ProcessEnv = process.env): Promise<ImageProvider | null> {
  const kind = (env.IMAGE_PROVIDER ?? "none").toLowerCase();
  switch (kind) {
    case "none":
      return null;
    case "gemini": {
      if (!env.IMAGE_API_KEY) throw new Error("IMAGE_PROVIDER=gemini requires IMAGE_API_KEY");
      return new GeminiImageProvider(env.IMAGE_API_KEY, env.IMAGE_MODEL ?? DEFAULT_GEMINI_MODEL);
    }
    case "muse": {
      // Lazy import: lib/ai throws at import time if AI_API_KEY is missing.
      const { ai } = await import("@/lib/ai");
      return new MuseImageProvider(ai, env.IMAGE_MODEL ?? "muse-image");
    }
    default:
      throw new Error(`Unknown IMAGE_PROVIDER "${kind}"`);
  }
}