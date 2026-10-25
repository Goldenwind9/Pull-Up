// Recap photo collage. Owner: AI (pipeline in lib/agents/recap.ts) + Data (this file).
// A recap uses every accepted photo since the crew's last recap; a crew can make many.
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ServiceError } from "./errors";

export type Recap = typeof schema.recaps.$inferSelect;

// Same idea as quest generation: a second tap waits on the running build.
const inFlight = new Map<string, Promise<Recap>>();

/** Builds a recap from the crew's unused photos and saves it. */
export async function makeRecap(crewId: string, userId?: string): Promise<Recap> {
  const running = inFlight.get(crewId);
  if (running) return running;
  const job = buildAndSave(crewId, userId).finally(() => inFlight.delete(crewId));
  inFlight.set(crewId, job);
  return job;
}

async function buildAndSave(crewId: string, userId?: string): Promise<Recap> {
  // Lazy imports: the recap pipeline pulls in sharp and the AI client.
  const [{ buildRecap, NoPhotosError }, { saveRecap, RecapConflictError }] = await Promise.all([
    import("@/lib/agents/recap"),
    import("@/lib/recap/saveRecap"),
  ]);

  const recapId = randomUUID();
  try {
    const result = await buildRecap(crewId, recapId);
    await saveRecap({
      recapId,
      crewId,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      script: result.script,
      imageKey: result.imageKey,
      proofIds: result.proofIds,
      userId,
    });
  } catch (err) {
    if (err instanceof NoPhotosError) {
      throw new ServiceError("No new photos since your last recap. Go pull up somewhere!", 409);
    }
    if (err instanceof RecapConflictError) {
      throw new ServiceError("Someone just made a recap with these photos. Refresh to see it.", 409);
    }
    throw err;
  }

  const [recap] = await db.select().from(schema.recaps).where(eq(schema.recaps.id, recapId));
  return recap;
}

export async function getLatestRecap(crewId: string): Promise<Recap | null> {
  const [row] = await db
    .select()
    .from(schema.recaps)
    .where(eq(schema.recaps.crewId, crewId))
    .orderBy(desc(schema.recaps.createdAt))
    .limit(1);
  return row ?? null;
}

/** Same-origin link to the card, so the Share button can fetch it without bucket CORS. */
export function recapImageUrl(recap: Recap) {
  return `/api/crews/${recap.crewId}/recap/image?v=${recap.id}`;
}
