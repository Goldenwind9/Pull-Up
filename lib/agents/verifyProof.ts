// Photo checker: one call to Muse Spark with the photo, returns a verdict + caption.
// Owner: AI. See "AI layer > Photo checker" in the architecture doc.
import { z } from "zod";
import sharp from "sharp";
import { ai, MODEL, proofCheckMode } from "@/lib/ai";
import { VERIFY_LENIENT_SYSTEM_PROMPT, VERIFY_SYSTEM_PROMPT, verifyProofUserPrompt } from "@/lib/prompts/verify";

export const ProofVerdictSchema = z.object({
  verdict: z.enum(["pass", "unsure", "fail"]),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  caption: z.string(),
});
export type ProofVerdict = z.infer<typeof ProofVerdictSchema>;

export type VerifyProofInput = {
  photo: Buffer; // the raw uploaded image
  task: string; // quests.task
  proofHint: string; // quests.proof_hint
  placeName: string; // quests.place_name
};

// If anything goes wrong, we return this. "unsure" lets the crew approve with one tap,
// so a broken AI call never blocks the fun.
const FALLBACK: ProofVerdict = {
  verdict: "unsure",
  confidence: 0,
  reason: "Couldn't check this one automatically.",
  caption: "The crew pulled up. Photo evidence pending!",
};

export async function verifyProof(input: VerifyProofInput): Promise<ProofVerdict> {
  const mode = proofCheckMode();
  const verdict = await checkPhoto(input, mode === "strict" ? VERIFY_SYSTEM_PROMPT : VERIFY_LENIENT_SYSTEM_PROMPT);
  if (mode === "strict") return verdict;
  // Checking is off: keep the model's caption (or the fallback's), always pass.
  if (mode === "off") return { ...verdict, verdict: "pass", confidence: 1, reason: "Photo check is off (PROOF_CHECK=off)." };
  // Lenient never fails a photo, even if the model ignores the prompt; a crewmate can still approve.
  return verdict.verdict === "fail" ? { ...verdict, verdict: "unsure" } : verdict;
}

async function checkPhoto(input: VerifyProofInput, systemPrompt: string): Promise<ProofVerdict> {
  try {
    // 1. Shrink the photo (rotate() fixes sideways phone photos)
    const resized = await sharp(input.photo)
      .rotate()
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${resized.toString("base64")}`;

    // 2. Ask Muse Spark
    const res = await ai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: verifyProofUserPrompt(input) },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    // 3. Parse the JSON answer
    const text = (res.choices[0].message.content ?? "").replace(/```json|```/g, "").trim();
    const parsed = ProofVerdictSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return FALLBACK;

    // 4. Enforce the 20-word caption limit in code, since models don't always obey
    const words = parsed.data.caption.trim().split(/\s+/);
    const caption = words.length > 20 ? words.slice(0, 20).join(" ") + "…" : parsed.data.caption;

    return { ...parsed.data, caption };
  } catch (err) {
    console.error("verifyProof failed:", err);
    return FALLBACK;
  }
}