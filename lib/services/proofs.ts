// Photo proof functions. Owner: Data + AI.
// One "pass" (or approved "unsure") from anyone completes the quest for the crew (B10, B11).
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { crewFeatures, isMember } from "@/lib/db/queries";
import { putObject, signedUrl } from "@/lib/storage";
import { logActivity } from "./activity";
import type { ProofVerdict } from "@/lib/agents/verifyProof";
import { completeDemo, demoPause, recognizeDemoPhoto, DEMO_BINGO, DEMO_UNKNOWN_CAPTION, DEMO_WINNER_REF } from "@/lib/demo";
import { ServiceError } from "./errors";

export type Proof = typeof schema.proofs.$inferSelect;

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** Storage key for a proof photo. The crew id is the second segment, see B12. */
function photoKey(crewId: string, questId: string) {
  return `proofs/${crewId}/${questId}/${randomUUID()}.jpg`;
}

/** Marks the quest done (once) and logs it. Safe to call twice. */
async function completeQuest(crewId: string, questId: string, userId: string) {
  const done = await db
    .update(schema.quests)
    .set({ status: "done" })
    .where(and(eq(schema.quests.id, questId), eq(schema.quests.status, "active")))
    .returning({ id: schema.quests.id });
  if (done.length) await logActivity({ crewId, userId, kind: "quest_completed", questId });
}

/**
 * Stores the photo, runs the photo checker, saves the proof and, on a pass, completes the quest.
 * Only photos that could complete the quest are checked. Once it's done, later photos are
 * accepted from anywhere and just get a caption, so the crew can keep the memories coming (B28).
 */
export async function submitProof(
  questId: string,
  userId: string,
  photo: Buffer,
): Promise<{ proof: Proof; bingo: string[] }> {
  const [quest] = await db.select().from(schema.quests).where(eq(schema.quests.id, questId)).limit(1);
  if (!quest) throw new ServiceError("Quest not found", 404);
  if (!(await isMember(quest.crewId, userId))) throw new ServiceError("You're not in this crew", 403);
  if (quest.status !== "active" && quest.status !== "done") {
    throw new ServiceError("This quest isn't on right now", 409);
  }

  // Normalize to an upright JPEG: phones send huge, sideways photos.
  let jpeg: Buffer;
  try {
    jpeg = await sharp(photo)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    throw new ServiceError("Couldn't read that photo. Try a JPEG or PNG.", 400);
  }

  const key = photoKey(quest.crewId, questId);
  const bonus = quest.status === "done";
  const { photoBingo } = await crewFeatures(quest.crewId);
  // Photo bingo: the checker also looks for any square nobody has checked yet.
  const openSquares = photoBingo
    ? await db
        .select({ idx: schema.bingoSquares.idx, prompt: schema.bingoSquares.prompt })
        .from(schema.bingoSquares)
        .where(and(eq(schema.bingoSquares.questId, questId), isNull(schema.bingoSquares.proofId)))
    : [];
  const check = completeDemo()
    ? demoCheck(jpeg, quest.sourceRef, openSquares)
    : (async () => {
        // Lazy import: lib/ai throws at import time without AI_API_KEY.
        const { verifyProof } = await import("@/lib/agents/verifyProof");
        const verdict = await verifyProof(
          { photo: jpeg, task: quest.task, proofHint: quest.proofHint, placeName: quest.placeName, bingo: openSquares },
          bonus ? "off" : undefined,
        );
        return { verdict, funFact: null };
      })();
  const [{ verdict, funFact }] = await Promise.all([check, putObject(key, jpeg, "image/jpeg")]);

  const [proof] = await db
    .insert(schema.proofs)
    .values({
      questId,
      userId,
      photoKey: key,
      verdict: verdict.verdict,
      // A bonus photo wasn't checked, so it has no confidence; the recap then prefers
      // the photo that actually completed the quest when it has to pick one per quest.
      confidence: bonus ? null : verdict.confidence,
      reason: bonus ? "Bonus photo: the quest was already done, so it wasn't checked." : verdict.reason,
      caption: verdict.caption,
      funFact: photoBingo ? funFact : null, // scripted demo only; otherwise filled in the background
    })
    .returning();
  await logActivity({
    crewId: quest.crewId,
    userId,
    kind: "proof_submitted",
    questId,
    meta: { verdict: verdict.verdict },
  });

  if (verdict.verdict === "pass") await completeQuest(quest.crewId, questId, userId);

  // "IS NULL" keeps the first photo that checked a square if two land at once.
  const checked = verdict.bingo?.length
    ? await db
        .update(schema.bingoSquares)
        .set({ proofId: proof.id, checkedAt: new Date() })
        .where(
          and(
            eq(schema.bingoSquares.questId, questId),
            inArray(schema.bingoSquares.idx, verdict.bingo),
            isNull(schema.bingoSquares.proofId),
          ),
        )
        .returning({ prompt: schema.bingoSquares.prompt })
    : [];

  // Fun fact in the background: Lens + the model take a while, and the crew page
  // refreshes itself while a quest is on, so it shows up on its own.
  if (photoBingo && !completeDemo()) void addFunFact(proof.id, key, jpeg, quest.placeName);

  return { proof, bingo: checked.map((c) => c.prompt) };
}

/** Any crew member except the uploader can approve an "unsure" proof (B11). */
export async function approveProof(proofId: string, userId: string): Promise<Proof> {
  const [row] = await db
    .select({ proof: schema.proofs, crewId: schema.quests.crewId })
    .from(schema.proofs)
    .innerJoin(schema.quests, eq(schema.quests.id, schema.proofs.questId))
    .where(eq(schema.proofs.id, proofId))
    .limit(1);
  if (!row) throw new ServiceError("Photo not found", 404);
  const { proof, crewId } = row;
  if (!(await isMember(crewId, userId))) throw new ServiceError("You're not in this crew", 403);
  if (proof.userId === userId) throw new ServiceError("Someone else in the crew has to approve your photo", 403);
  if (proof.verdict !== "unsure") throw new ServiceError("Only unsure photos need approval", 409);
  if (proof.approvedBy) throw new ServiceError("Already approved", 409);

  const [approved] = await db
    .update(schema.proofs)
    .set({ approvedBy: userId })
    .where(eq(schema.proofs.id, proofId))
    .returning();
  await completeQuest(crewId, proof.questId, userId);
  return approved;
}

async function addFunFact(proofId: string, key: string, photo: Buffer, placeName: string) {
  try {
    const { funFactFor } = await import("@/lib/agents/funFact");
    const fact = await funFactFor({ photo, imageUrl: await signedUrl(key), placeName });
    if (fact) await db.update(schema.proofs).set({ funFact: fact }).where(eq(schema.proofs.id, proofId));
  } catch (err) {
    console.warn("[proofs] fun fact failed:", err);
  }
}

/**
 * COMPLETE_DEMO_MODE photo check (lib/demo.ts): every photo passes. The 5 demo photos get
 * their scripted caption and fun fact, and check off their bingo square on the Cidercade quest.
 */
async function demoCheck(
  jpeg: Buffer,
  sourceRef: string,
  openSquares: { idx: number; prompt: string }[],
): Promise<{ verdict: ProofVerdict; funFact: string | null }> {
  await demoPause(1500); // let "Checking your photo…" show
  const photo = await recognizeDemoPhoto(jpeg);
  const square =
    photo && sourceRef === DEMO_WINNER_REF
      ? openSquares.find((s) => s.idx === photo.bingo && s.prompt === DEMO_BINGO[photo.bingo])
      : undefined;
  return {
    verdict: {
      verdict: "pass",
      confidence: 0.95,
      reason: "Scripted demo check.",
      caption: photo?.caption ?? DEMO_UNKNOWN_CAPTION,
      bingo: square ? [square.idx] : [],
    },
    funFact: photo?.funFact ?? null,
  };
}
