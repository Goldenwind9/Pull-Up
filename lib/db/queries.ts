// Small read queries shared by agents and services. Owner: Data.
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

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

export async function isMember(crewId: string, userId: string) {
  const [row] = await db
    .select({ userId: schema.crewMembers.userId })
    .from(schema.crewMembers)
    .where(and(eq(schema.crewMembers.crewId, crewId), eq(schema.crewMembers.userId, userId)))
    .limit(1);
  return Boolean(row);
}
