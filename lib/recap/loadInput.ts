// Loads what the recap needs from the database.
//
// getRecapInput(crewId) returns the crew's UNUSED accepted photos:
//   photos:   proofs where recap_id IS NULL AND the proof is accepted
//             (verdict 'pass', or an 'unsure' a crewmate approved: approved_by is set).
//             Several photos per quest are fine; the recap picks the best one per quest.
//   crewName: crews.name
//   stats:    questsDone = distinct quests among the photos, photos = number of photos,
//             votes = 'voted' activity rows from the start of the earliest photo's quest week
//             up to the latest photo, so the votes that picked those quests count.
import { and, asc, count, eq, gte, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { TIMEZONE } from "@/lib/time";
import { featuresOf } from "@/lib/features";
import type { RecapInput, RecapPhoto } from "@/lib/agents/recap";

export async function getRecapInput(crewId: string): Promise<RecapInput> {
  const [crew] = await db
    .select({ name: schema.crews.name, features: schema.crews.features })
    .from(schema.crews)
    .where(eq(schema.crews.id, crewId))
    .limit(1);
  if (!crew) throw new Error(`Crew ${crewId} not found`);

  const rows = await db
    .select({
      proofId: schema.proofs.id,
      questId: schema.quests.id,
      photoKey: schema.proofs.photoKey,
      questTitle: schema.quests.title,
      placeName: schema.quests.placeName,
      caption: schema.proofs.caption,
      takenAt: schema.proofs.createdAt,
      confidence: schema.proofs.confidence,
      weekStart: schema.quests.weekStart,
    })
    .from(schema.proofs)
    .innerJoin(schema.quests, eq(schema.quests.id, schema.proofs.questId))
    .where(
      and(
        eq(schema.quests.crewId, crewId),
        isNull(schema.proofs.recapId),
        or(eq(schema.proofs.verdict, "pass"), isNotNull(schema.proofs.approvedBy)),
      ),
    )
    .orderBy(asc(schema.proofs.createdAt));

  const photos: RecapPhoto[] = rows.map((r) => ({
    proofId: r.proofId,
    questId: r.questId,
    photoKey: r.photoKey,
    questTitle: r.questTitle,
    placeName: r.placeName,
    caption: r.caption,
    takenAt: r.takenAt.toISOString(),
    confidence: r.confidence ?? 0,
  }));

  let votes = 0;
  if (rows.length) {
    const firstWeek = rows.map((r) => r.weekStart).sort()[0];
    const [row] = await db
      .select({ votes: count() })
      .from(schema.activity)
      .where(
        and(
          eq(schema.activity.crewId, crewId),
          eq(schema.activity.kind, "voted"),
          gte(schema.activity.time, sql`(${firstWeek}::date)::timestamp AT TIME ZONE ${TIMEZONE}`),
          lte(schema.activity.time, rows[rows.length - 1].takenAt),
        ),
      );
    votes = row.votes;
  }

  const questIds = [...new Set(rows.map((r) => r.questId))];
  const roles = questIds.length && featuresOf(crew.features).secretRoles ? await getRolesFor(questIds) : [];

  return {
    crewName: crew.name,
    photos,
    stats: { questsDone: questIds.length, photos: rows.length, votes },
    roles,
  };
}

/** Secret roles for these quests, with who had them. They're revealed in the recap. */
export async function getRolesFor(questIds: string[]) {
  return db
    .select({
      quest: schema.quests.title,
      name: schema.users.name,
      role: schema.questRoles.role,
      emoji: schema.questRoles.emoji,
      mission: schema.questRoles.mission,
    })
    .from(schema.questRoles)
    .innerJoin(schema.quests, eq(schema.quests.id, schema.questRoles.questId))
    .innerJoin(schema.users, eq(schema.users.id, schema.questRoles.userId))
    .where(inArray(schema.questRoles.questId, questIds))
    .orderBy(asc(schema.quests.createdAt), asc(schema.users.name));
}
