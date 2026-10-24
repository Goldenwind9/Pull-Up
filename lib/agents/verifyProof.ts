// Photo checker: one model call with the photo + the quest's task and proof hint.
// Owner: AI. "unsure" lets the crew approve with a tap, so a bad AI call never blocks.
import { z } from "zod";

export const VerifyResult = z.object({
  verdict: z.enum(["pass", "unsure", "fail"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  caption: z.string(), // playful, 20 words or fewer
});
export type VerifyResult = z.infer<typeof VerifyResult>;

/**
 * TODO(AI): resize to ~1024px with sharp, send as a base64 image with
 * lib/prompts/verify.ts, parse with VerifyResult.
 */
export async function verifyProof(input: {
  photo: Buffer;
  task: string;
  proofHint: string;
}): Promise<VerifyResult> {
  void input;
  throw new Error("verifyProof not implemented");
}
