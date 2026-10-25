// Small read queries shared by agents and services. Owner: Data.
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { featuresOf, type Features } from "@/lib/features";

/** Last 8 quests for a crew, newest first, including proposals that lost the vote. */
export async function getPastQuests(crewId: string) {
  return db
    .select({
      title: schema.quests.title,
      place: schema.quests.placeName,
      week: schema.quests.weekStart,
      status: schema.quests.status,
    })
    .from(schema.quests)
    .where(eq(schema.quests.crewId, crewId))
    .orderBy(desc(schema.quests.createdAt))
    .limit(8);
}

/** Which optional features a crew uses (all on if the crew is missing, so callers fail elsewhere). */
export async function crewFeatures(crewId: string): Promise<Features> {
  const [row] = await db
    .select({ features: schema.crews.features })
    .from(schema.crews)
    .where(eq(schema.crews.id, crewId))
    .limit(1);
  return featuresOf(row?.features);
}

/** False for a session whose user was deleted (e.g. by `npm run db:clean`). */
export async function userExists(userId: string) {
  const [row] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return Boolean(row);
}

export async function isMember(crewId: string, userId: string) {
  const [row] = await db
    .select({ userId: schema.crewMembers.userId })
    .from(schema.crewMembers)
    .where(and(eq(schema.crewMembers.crewId, crewId), eq(schema.crewMembers.userId, userId)))
    .limit(1);
  return Boolean(row);
}
