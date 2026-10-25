// Records a finished recap and marks its photos as used, in ONE database transaction.
import { and, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { TIMEZONE } from "@/lib/time";
import type { RecapScript } from "@/lib/agents/recap";

export type SaveRecapInput = {
  recapId: string; // uuid, used as recaps.id
  crewId: string;
  periodStart: string; // ISO timestamp
  periodEnd: string; // ISO timestamp
  script: RecapScript; // recaps.script (jsonb)
  imageKey: string; // recaps.image_key
  proofIds: string[]; // every proof that went into this recap
  userId?: string; // who tapped "Make recap", for the activity log
};

/** Thrown when some of the photos were already used by another recap (someone double-tapped). */
export class RecapConflictError extends Error {
  constructor() {
    super("Some of these photos were already used by another recap");
    this.name = "RecapConflictError";
  }
}

// Required behaviour, in one transaction:
//   1. INSERT INTO recaps (id, crew_id, period_start, period_end, script, image_key) VALUES (...)
//   2. UPDATE proofs SET recap_id = <recapId> WHERE id = ANY(<proofIds>) AND recap_id IS NULL
//      If the number of rows updated is not proofIds.length: ROLLBACK and throw RecapConflictError.
//   3. INSERT an activity row: kind 'recap_made'
// Also: recaps must NOT have a unique constraint on (crew_id, period): a crew can make several recaps.
export async function saveRecap(input: SaveRecapInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(schema.recaps).values({
      id: input.recapId,
      crewId: input.crewId,
      // The columns are dates; keep the Austin calendar day of each timestamp.
      periodStart: austinDate(input.periodStart),
      periodEnd: austinDate(input.periodEnd),
      script: input.script,
      imageKey: input.imageKey,
    });
    const claimed = await tx
      .update(schema.proofs)
      .set({ recapId: input.recapId })
      .where(and(inArray(schema.proofs.id, input.proofIds), isNull(schema.proofs.recapId)))
      .returning({ id: schema.proofs.id });
    // Throwing rolls the whole transaction back, including the recaps row.
    if (claimed.length !== input.proofIds.length) throw new RecapConflictError();
    await tx.insert(schema.activity).values({
      crewId: input.crewId,
      userId: input.userId,
      kind: "recap_made",
      meta: { recapId: input.recapId, photos: input.proofIds.length },
    });
  });
}

function austinDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}
