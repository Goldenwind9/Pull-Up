// Monthly recap comic. Owner: AI (pipeline in lib/agents/recap.ts) + Data (this file).
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { monthPeriod } from "@/lib/time";
import { logActivity } from "./activity";

export type Recap = typeof schema.recaps.$inferSelect;

// Same idea as quest generation: a second tap waits on the running build.
const inFlight = new Map<string, Promise<Recap>>();

/** Builds (or rebuilds) this month's recap and saves one row per crew per month. */
export async function makeRecap(crewId: string, userId?: string): Promise<Recap> {
  const running = inFlight.get(crewId);
  if (running) return running;
  const job = buildAndSave(crewId, userId).finally(() => inFlight.delete(crewId));
  inFlight.set(crewId, job);
  return job;
}

async function buildAndSave(crewId: string, userId?: string): Promise<Recap> {
  const { start, end } = monthPeriod();
  // Lazy import: the recap pipeline pulls in sharp and the AI client.
  const { buildRecap } = await import("@/lib/agents/recap");
  const result = await buildRecap(crewId, start, end);

  const recap = await db.transaction(async (tx) => {
    // Rebuilding this month replaces the old row (B30).
    await tx
      .delete(schema.recaps)
      .where(and(eq(schema.recaps.crewId, crewId), eq(schema.recaps.periodStart, start)));
    const [row] = await tx
      .insert(schema.recaps)
      .values({ crewId, periodStart: start, periodEnd: end, script: result.script, imageKey: result.imageKey })
      .returning();
    return row;
  });
  await logActivity({ crewId, userId, kind: "recap_made", meta: { periodStart: start } });
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
