// Loads what the recap needs from the database: crew name, completed quests with
// captions, and summed stats from crew_weekly.
import { and, asc, eq, gte, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { RecapInput, RecapQuest } from "@/lib/agents/recap";

/** periodStart / periodEnd are inclusive YYYY-MM-DD dates. A quest counts in the period its completing photo was taken. */
export async function getRecapInput(crewId: string, periodStart: string, periodEnd: string): Promise<RecapInput> {
  const [crew] = await db
    .select({ name: schema.crews.name })
    .from(schema.crews)
    .where(eq(schema.crews.id, crewId))
    .limit(1);
  if (!crew) throw new Error(`Crew ${crewId} not found`);

  // Done quests with the photo that completed them (a pass, or an approved unsure).
  const rows = await db
    .select({
      questId: schema.quests.id,
      title: schema.quests.title,
      placeName: schema.quests.placeName,
      caption: schema.proofs.caption,
      at: schema.proofs.createdAt,
    })
    .from(schema.quests)
    .innerJoin(schema.proofs, eq(schema.proofs.questId, schema.quests.id))
    .where(
      and(
        eq(schema.quests.crewId, crewId),
        eq(schema.quests.status, "done"),
        gte(schema.proofs.createdAt, sql`${periodStart}::date`),
        lt(schema.proofs.createdAt, sql`${periodEnd}::date + interval '1 day'`),
        or(eq(schema.proofs.verdict, "pass"), isNotNull(schema.proofs.approvedBy)),
      ),
    )
    .orderBy(asc(schema.proofs.createdAt));

  const quests = new Map<string, RecapQuest>();
  for (const r of rows) {
    if (quests.has(r.questId)) continue; // first completing photo wins
    quests.set(r.questId, {
      title: r.title,
      placeName: r.placeName,
      caption: r.caption,
      completedAt: r.at.toISOString(),
    });
  }

  const [stats] = await db
    .select({
      questsDone: sql<number>`coalesce(sum(${schema.crewWeekly.questsDone}), 0)::int`,
      photos: sql<number>`coalesce(sum(${schema.crewWeekly.photos}), 0)::int`,
      votes: sql<number>`coalesce(sum(${schema.crewWeekly.votes}), 0)::int`,
    })
    .from(schema.crewWeekly)
    .where(
      and(
        eq(schema.crewWeekly.crewId, crewId),
        // Weekly buckets that overlap the period, so a week straddling the 1st still counts.
        gte(schema.crewWeekly.week, sql`${periodStart}::date - interval '6 days'`),
        lte(schema.crewWeekly.week, sql`${periodEnd}::date`),
      ),
    );

  return { crewName: crew.name, quests: [...quests.values()], stats };
}
