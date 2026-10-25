// Photo proof functions. Owner: Data + AI.
// One "pass" (or approved "unsure") from anyone completes the quest for the crew (B10, B11).
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isMember } from "@/lib/db/queries";
import { putObject } from "@/lib/storage";
import { logActivity } from "./activity";
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
 * Stores the photo, runs the photo checker, saves the proof and, on a pass,
 * completes the quest. Extra photos after the quest is done still get a caption (B28).
 */
export async function submitProof(questId: string, userId: string, photo: Buffer): Promise<Proof> {
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
  // Lazy import: lib/ai throws at import time without AI_API_KEY.
  const { verifyProof } = await import("@/lib/agents/verifyProof");
  const [verdict] = await Promise.all([
    verifyProof({ photo: jpeg, task: quest.task, proofHint: quest.proofHint, placeName: quest.placeName }),
    putObject(key, jpeg, "image/jpeg"),
  ]);

  const [proof] = await db
    .insert(schema.proofs)
    .values({
      questId,
      userId,
      photoKey: key,
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      reason: verdict.reason,
      caption: verdict.caption,
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
  return proof;
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
