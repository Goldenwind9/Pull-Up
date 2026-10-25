// Secret roles + photo bingo for a quest that just started. Owner: AI + Data.
// Idempotent: deals roles only to members who don't have one yet (late joiners get one
// on their first visit) and writes the bingo card once.
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { crewFeatures } from "@/lib/db/queries";

const inFlight = new Map<string, Promise<void>>();

export async function prepareQuest(questId: string): Promise<void> {
  const running = inFlight.get(questId);
  if (running) return running;
  const job = prepare(questId).finally(() => inFlight.delete(questId));
  inFlight.set(questId, job);
  return job;
}

async function prepare(questId: string): Promise<void> {
  const [quest] = await db.select().from(schema.quests).where(eq(schema.quests.id, questId)).limit(1);
  if (!quest) return;
  const features = await crewFeatures(quest.crewId);
  if (!features.secretRoles && !features.photoBingo) return;
  const [members, roles, squares] = await Promise.all([
    db
      .select({ userId: schema.users.id, name: schema.users.name, interests: schema.users.interests })
      .from(schema.crewMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.crewMembers.userId))
      .where(eq(schema.crewMembers.crewId, quest.crewId))
      .orderBy(asc(schema.crewMembers.joinedAt)), // join order: roles are dealt predictably
    db.select().from(schema.questRoles).where(eq(schema.questRoles.questId, questId)),
    db.select({ idx: schema.bingoSquares.idx }).from(schema.bingoSquares).where(eq(schema.bingoSquares.questId, questId)),
  ]);

  const missing = features.secretRoles ? members.filter((m) => !roles.some((r) => r.userId === m.userId)) : [];
  const wantBingo = features.photoBingo && squares.length === 0;
  if (!missing.length && !wantBingo) return;

  // Lazy import: the AI client throws at import time without AI_API_KEY.
  const { writeQuestExtras } = await import("@/lib/agents/questExtras");
  const extras = await writeQuestExtras({
    quest: { title: quest.title, task: quest.task, placeName: quest.placeName, sourceRef: quest.sourceRef },
    members: missing.map((m) => ({ name: m.name, interests: m.interests })),
    takenRoles: roles.map((r) => r.role),
    wantBingo,
  });

  if (missing.length) {
    await db
      .insert(schema.questRoles)
      .values(missing.map((m, i) => ({ questId, userId: m.userId, ...extras.roles[i] })))
      .onConflictDoNothing();
  }
  if (wantBingo && extras.bingo.length) {
    await db
      .insert(schema.bingoSquares)
      .values(extras.bingo.map((prompt, idx) => ({ questId, idx, prompt })))
      .onConflictDoNothing();
  }
}
