// Quest + voting functions. Owner: Data + AI.
//
// Vote closing (no cron): resolveVoting(crewId) runs whenever the crew page loads
// or someone votes. Winner is chosen when more than half the crew has voted,
// or VOTE_WINDOW_MS after the proposals were created. See ASSUMPTIONS.md B5-B9, B21-B25.
import { and, asc, count, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isMember } from "@/lib/db/queries";
import { weekStart, dayOfWeek, VOTE_WINDOW_MS } from "@/lib/time";
import { logActivity } from "./activity";
import { ServiceError } from "./errors";

export type Quest = typeof schema.quests.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Members who skipped the vibe chips still count toward crew size.
const NO_VIBES = ["open to anything"];

/**
 * Serializes quest writes for one crew (generate, vote, resolve), so two phones
 * tapping at the same moment can't create two sets of quests or two winners.
 * Released automatically when the transaction ends.
 */
async function lockCrew(tx: Tx, crewId: string) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"crew:" + crewId}))`);
}

async function hasQuestsThisWeek(conn: typeof db | Tx, crewId: string, week: string) {
  const [row] = await conn
    .select({ id: schema.quests.id })
    .from(schema.quests)
    .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.weekStart, week)))
    .limit(1);
  return Boolean(row);
}

// The agent takes a while. If someone taps Pull up again meanwhile, they wait on
// the same run instead of starting (and paying for) a second one. Works because
// pm2 runs a single process; the advisory lock still guards the insert.
const inFlight = new Map<string, Promise<Quest[]>>();

/** Runs the quest agent and saves its proposals for this week. */
export async function generateQuests(crewId: string): Promise<Quest[]> {
  const running = inFlight.get(crewId);
  if (running) return running;
  const job = runGeneration(crewId).finally(() => inFlight.delete(crewId));
  inFlight.set(crewId, job);
  return job;
}

async function runGeneration(crewId: string): Promise<Quest[]> {
  const week = weekStart();
  if (await hasQuestsThisWeek(db, crewId, week)) {
    throw new ServiceError("This week's quests are already out", 409);
  }

  const [crew] = await db.select().from(schema.crews).where(eq(schema.crews.id, crewId)).limit(1);
  if (!crew) throw new ServiceError("Crew not found", 404);

  const members = await db
    .select({ interests: schema.users.interests })
    .from(schema.crewMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.crewMembers.userId))
    .where(eq(schema.crewMembers.crewId, crewId));

  // Lazy import: lib/ai throws at import time without AI_API_KEY, and this file
  // is also loaded by the crew page through resolveVoting.
  const { runQuestAgent } = await import("@/lib/agents/questAgent");
  const proposed = await runQuestAgent({
    crewId,
    memberInterests: members.map((m) => (m.interests.length ? m.interests : NO_VIBES)),
    homeLabel: crew.homeLabel,
    homeLat: crew.homeLat,
    homeLng: crew.homeLng,
    radiusKm: crew.radiusKm,
    dayOfWeek: dayOfWeek(),
  });

  const now = Date.now();
  return db.transaction(async (tx) => {
    await lockCrew(tx, crewId);
    if (await hasQuestsThisWeek(tx, crewId, week)) {
      throw new ServiceError("This week's quests are already out", 409);
    }
    return tx
      .insert(schema.quests)
      .values(
        proposed.map((q, i) => ({
          crewId,
          weekStart: week,
          // Nothing to vote on with a single quest, so it starts active (B23).
          status: proposed.length === 1 ? ("active" as const) : ("proposed" as const),
          title: q.title,
          hook: q.hook,
          task: q.task,
          placeName: q.place.name,
          address: q.place.address || null,
          lat: q.place.lat,
          lng: q.place.lng,
          // Event source_refs are links; place source_refs are Google place ids.
          source: q.place.source_ref.startsWith("http") ? ("google_events" as const) : ("google_maps" as const),
          sourceRef: q.place.source_ref,
          proofHint: q.proof_hint,
          whyThisCrew: q.why_this_crew,
          estCost: q.est_cost,
          timeNeededMin: Math.round(q.time_needed_min),
          // 1 ms apart so the agent's order survives as a tie-break (B22).
          createdAt: new Date(now + i),
        })),
      )
      .returning();
  });
}

/** One vote per person per week, no changing it (B21). Returns the active quest if this vote closed voting. */
export async function castVote(questId: string, userId: string): Promise<Quest | null> {
  const [quest] = await db.select().from(schema.quests).where(eq(schema.quests.id, questId)).limit(1);
  if (!quest) throw new ServiceError("Quest not found", 404);
  if (!(await isMember(quest.crewId, userId))) throw new ServiceError("You're not in this crew", 403);

  // Close the vote first if time is already up, so a late vote can't revive it.
  await resolveVoting(quest.crewId);

  await db.transaction(async (tx) => {
    await lockCrew(tx, quest.crewId);
    const [current] = await tx
      .select({ status: schema.quests.status })
      .from(schema.quests)
      .where(eq(schema.quests.id, questId));
    if (current?.status !== "proposed") throw new ServiceError("Voting is closed", 409);

    // The primary key and the one_vote_per_week index both reject a second vote.
    const inserted = await tx
      .insert(schema.questVotes)
      .values({ questId, userId, crewId: quest.crewId, weekStart: quest.weekStart })
      .onConflictDoNothing()
      .returning();
    if (!inserted.length) throw new ServiceError("You already voted this week", 409);
  });

  await logActivity({ crewId: quest.crewId, userId, kind: "voted", questId });
  return resolveVoting(quest.crewId);
}

/**
 * Expires leftovers from earlier weeks (B9), then closes this week's vote if it's time.
 * Returns this week's chosen quest (active or done), or null while voting is open
 * or before anyone has tapped Pull up.
 */
export async function resolveVoting(crewId: string, now = new Date()): Promise<Quest | null> {
  const week = weekStart(now);
  return db.transaction(async (tx) => {
    await lockCrew(tx, crewId);

    await tx
      .update(schema.quests)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.quests.crewId, crewId),
          inArray(schema.quests.status, ["proposed", "active"]),
          lt(schema.quests.weekStart, week),
        ),
      );

    const thisWeek = await tx
      .select()
      .from(schema.quests)
      .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.weekStart, week)))
      .orderBy(asc(schema.quests.createdAt));

    const chosen = thisWeek.find((q) => q.status === "active" || q.status === "done");
    if (chosen) return chosen;

    const proposals = thisWeek.filter((q) => q.status === "proposed");
    if (!proposals.length) return null;

    const votes = await tx
      .select({ questId: schema.questVotes.questId, createdAt: schema.questVotes.createdAt })
      .from(schema.questVotes)
      .where(and(eq(schema.questVotes.crewId, crewId), eq(schema.questVotes.weekStart, week)));
    const [{ members }] = await tx
      .select({ members: count() })
      .from(schema.crewMembers)
      .where(eq(schema.crewMembers.crewId, crewId));

    const majority = votes.length * 2 > members;
    const windowOver = now.getTime() - proposals[0].createdAt.getTime() >= VOTE_WINDOW_MS;
    if (!majority && !windowOver) return null;

    const winner = pickWinner(proposals, votes);
    await tx.update(schema.quests).set({ status: "active" }).where(eq(schema.quests.id, winner.id));
    await tx
      .update(schema.quests)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.quests.crewId, crewId),
          eq(schema.quests.weekStart, week),
          eq(schema.quests.status, "proposed"),
          ne(schema.quests.id, winner.id),
        ),
      );
    return { ...winner, status: "active" };
  });
}

/**
 * Most votes wins. Tie: the quest whose first vote came earliest (B7).
 * No votes at all: the agent's first pick (B22). `proposals` is in agent order.
 */
function pickWinner(proposals: Quest[], votes: { questId: string; createdAt: Date }[]): Quest {
  const score = (q: Quest) => {
    const mine = votes.filter((v) => v.questId === q.id);
    return { n: mine.length, first: Math.min(...mine.map((v) => v.createdAt.getTime())) }; // Infinity if none
  };
  let best = proposals[0];
  let bestScore = score(best);
  for (const q of proposals.slice(1)) {
    const s = score(q);
    if (s.n > bestScore.n || (s.n === bestScore.n && s.first < bestScore.first)) {
      best = q;
      bestScore = s;
    }
  }
  return best;
}
