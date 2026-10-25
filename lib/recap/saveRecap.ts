// Records a finished recap and marks its photos as used. TODO(Data): implement as ONE database transaction.
import type { RecapScript } from "@/lib/agents/recap";

export type SaveRecapInput = {
  recapId: string; // uuid, used as recaps.id
  crewId: string;
  periodStart: string; // ISO timestamp
  periodEnd: string; // ISO timestamp
  script: RecapScript; // recaps.script (jsonb)
  imageKey: string; // recaps.image_key
  proofIds: string[]; // every proof that went into this recap
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
  void input;
  throw new Error("saveRecap is not implemented yet (waiting on the database schema)");
}