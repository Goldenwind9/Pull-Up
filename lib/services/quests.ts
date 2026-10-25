// Quest + voting functions. Owner: Data + AI.
//
// Vote closing (no cron): resolveVoting(crewId) runs whenever the crew page loads
// or someone votes. Winner is chosen when more than half the crew has voted,
// or VOTE_WINDOW_MS after the proposals were created. See ASSUMPTIONS.md B5-B9, B21-B25.
import { and, asc, count, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import type { TravelTime } from "@/lib/db/schema";
import { isMember } from "@/lib/db/queries";
import { featuresOf } from "@/lib/features";
import { centroid, walkMinutes, type Point } from "@/lib/geo";
import { completeDemo, demoPause, DEMO_NOW_QUESTS, DEMO_QUESTS, DEMO_WINNER_REF } from "@/lib/demo";
import type { CrewProfile, ProposedQuest } from "@/lib/agents/questAgent";
import { weekStart, dayOfWeek, VOTE_WINDOW_MS } from "@/lib/time";
import { logActivity } from "./activity";
import { ServiceError } from "./errors";
import { prepareQuest } from "./questExtras";

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

/** The quest agent, or the scripted quests in COMPLETE_DEMO_MODE (lib/demo.ts). */
async function proposeQuests(scripted: ProposedQuest[], profile: CrewProfile): Promise<ProposedQuest[]> {
  if (completeDemo()) {
    await demoPause(3000); // let the loading screen play, like the real agent
    return scripted;
  }
  // Lazy import: lib/ai throws at import time without AI_API_KEY, and this file
  // is also loaded by the crew page through resolveVoting.
  const { runQuestAgent } = await import("@/lib/agents/questAgent");
  return runQuestAgent(profile);
}

/** Scripted demo: any vote closes voting, and the Cidercade quest always wins. */
async function rigDemoVote(tx: Tx, crewId: string, week: string) {
  const proposals = await tx
    .select({ id: schema.quests.id, sourceRef: schema.quests.sourceRef })
    .from(schema.quests)
    .where(
      and(
        eq(schema.quests.crewId, crewId),
        eq(schema.quests.weekStart, week),
        eq(schema.quests.kind, "weekly"),
        eq(schema.quests.status, "proposed"),
      ),
    )
    .orderBy(asc(schema.quests.createdAt));
  const winner = proposals.find((q) => q.sourceRef === DEMO_WINNER_REF) ?? proposals[0];
  if (!winner) return;
  await tx.update(schema.quests).set({ status: "active" }).where(eq(schema.quests.id, winner.id));
  await tx
    .update(schema.quests)
    .set({ status: "expired" })
    .where(and(inArray(schema.quests.id, proposals.map((q) => q.id)), ne(schema.quests.id, winner.id)));
}

async function hasQuestsThisWeek(conn: typeof db | Tx, crewId: string, week: string) {
  const [row] = await conn
    .select({ id: schema.quests.id })
    .from(schema.quests)
    .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.weekStart, week), eq(schema.quests.kind, "weekly")))
    .limit(1);
  return Boolean(row);
}

type Member = {
  userId: string;
  name: string;
  interests: string[];
  startLabel: string | null;
  startLat: number | null;
  startLng: number | null;
};

async function loadMembers(crewId: string): Promise<Member[]> {
  return db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      interests: schema.users.interests,
      startLabel: schema.crewMembers.startLabel,
      startLat: schema.crewMembers.startLat,
      startLng: schema.crewMembers.startLng,
    })
    .from(schema.crewMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.crewMembers.userId))
    .where(eq(schema.crewMembers.crewId, crewId));
}

/**
 * Fair meetup: each member's car-free trip (walking or transit) to a place, via SerpApi
 * Google Maps Directions. Members without a starting area are skipped. Null if nothing came back.
 */
async function tripsTo(place: { lat: number | null; lng: number | null }, members: Member[]): Promise<TravelTime[] | null> {
  if (place.lat == null || place.lng == null) return null;
  const to = { lat: place.lat, lng: place.lng };
  const starting = members.filter((m) => m.startLat != null && m.startLng != null);
  if (!starting.length) return null;
  if (completeDemo()) {
    // Scripted demo: estimate from distance instead of calling Directions (no SerpApi).
    return starting.map((m) => {
      const walk = walkMinutes({ lat: m.startLat!, lng: m.startLng! }, to);
      // Past a 25-minute walk, assume a bus: about 3x faster plus a wait.
      const trip = walk <= 25 ? { minutes: walk, mode: "walking" } : { minutes: Math.round(8 + walk / 3), mode: "transit" };
      return { userId: m.userId, name: m.name, from: m.startLabel ?? "", ...trip };
    });
  }
  // Lazy import: lib/serp loads lib/ai, which throws at import time without AI_API_KEY.
  const { travelTime } = await import("@/lib/serp");
  const trips = await Promise.allSettled(
    starting.map(async (m) => {
      const trip = await travelTime({ lat: m.startLat!, lng: m.startLng! }, to);
      return trip && { userId: m.userId, name: m.name, from: m.startLabel ?? "", ...trip };
    }),
  );
  const found = trips.flatMap((t) => (t.status === "fulfilled" && t.value ? [t.value] : []));
  return found.length ? found : null;
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

  const members = await loadMembers(crewId);
  const fair = featuresOf(crew.features).fairMeetup;
  // Fair meetup: with 2+ starting areas known, search around the middle of them instead of home.
  const starts: Point[] = fair
    ? members.flatMap((m) => (m.startLat != null && m.startLng != null ? [{ lat: m.startLat, lng: m.startLng }] : []))
    : [];
  const center = starts.length >= 2 ? centroid(starts) : null;

  const proposed = await proposeQuests(DEMO_QUESTS, {
    crewId,
    memberInterests: members.map((m) => (m.interests.length ? m.interests : NO_VIBES)),
    homeLabel: crew.homeLabel,
    homeLat: crew.homeLat,
    homeLng: crew.homeLng,
    radiusKm: crew.radiusKm,
    dayOfWeek: dayOfWeek(),
    searchLat: center?.lat,
    searchLng: center?.lng,
    startAreas: center ? [...new Set(members.flatMap((m) => (m.startLabel ? [m.startLabel] : [])))] : undefined,
    memberStarts: center ? starts : undefined,
  });
  const trips = await Promise.all(proposed.map((q) => (fair ? tripsTo(q.place, members) : null)));
  // Fairest first (shortest longest-trip). The order is also the no-votes tie-break (B22).
  // The scripted demo keeps its own order, so the cards always appear the same way.
  const longest = (t: TravelTime[] | null) => (t ? Math.max(...t.map((x) => x.minutes)) : Infinity);
  const ranked = proposed.map((q, i) => ({ q, travel: trips[i] }));
  if (!completeDemo()) ranked.sort((a, b) => longest(a.travel) - longest(b.travel));

  const now = Date.now();
  return db.transaction(async (tx) => {
    await lockCrew(tx, crewId);
    if (await hasQuestsThisWeek(tx, crewId, week)) {
      throw new ServiceError("This week's quests are already out", 409);
    }
    return tx
      .insert(schema.quests)
      .values(
        ranked.map(({ q, travel }, i) => ({
          crewId,
          weekStart: week,
          // Nothing to vote on with a single quest, so it starts active (B23).
          status: ranked.length === 1 ? ("active" as const) : ("proposed" as const),
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
          travel,
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
    if (completeDemo()) await rigDemoVote(tx, quest.crewId, quest.weekStart);
  });

  await logActivity({ crewId: quest.crewId, userId, kind: "voted", questId });
  const active = await resolveVoting(quest.crewId);
  // This vote started the quest: deal secret roles and the bingo card now.
  if (active?.status === "active") await prepareQuest(active.id);
  return active;
}

/**
 * Expires leftovers from earlier weeks (B9) and Pull Up Now quests whose time is up,
 * then closes this week's vote if it's time. Returns this week's chosen weekly quest
 * (active or done), or null while voting is open or before anyone has tapped Pull up.
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
    await tx
      .update(schema.quests)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.quests.crewId, crewId),
          eq(schema.quests.kind, "now"),
          inArray(schema.quests.status, ["proposed", "active"]),
          lt(schema.quests.expiresAt, now),
        ),
      );

    const thisWeek = await tx
      .select()
      .from(schema.quests)
      .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.weekStart, week), eq(schema.quests.kind, "weekly")))
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
          eq(schema.quests.kind, "weekly"),
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

// ---------- Pull Up Now ----------

export type NowRequest = {
  minutes: number; // how long the crew has
  budget: number; // dollars per person, 0 = free only
  lat: number; // where the crew is right now
  lng: number;
  label: string; // "near campus", "Near me"
  note?: string; // anything else they typed
};

// Photos can still come in a little after the time is up (walking back, slow uploads).
const NOW_GRACE_MIN = 30;

async function activeNowQuest(crewId: string) {
  const [row] = await db
    .select()
    .from(schema.quests)
    .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.kind, "now"), eq(schema.quests.status, "active")))
    .limit(1);
  return row ?? null;
}

const nowInFlight = new Map<string, Promise<Quest[]>>();

/**
 * Pull Up Now: 3 options that are open right now and walkable from where the crew is.
 * Replaces any earlier unpicked options. Doesn't touch the weekly quest.
 */
export async function generateNowQuests(crewId: string, request: NowRequest): Promise<Quest[]> {
  const running = nowInFlight.get(crewId);
  if (running) return running;
  const job = runNowGeneration(crewId, request).finally(() => nowInFlight.delete(crewId));
  nowInFlight.set(crewId, job);
  return job;
}

async function runNowGeneration(crewId: string, request: NowRequest): Promise<Quest[]> {
  const [crew] = await db.select().from(schema.crews).where(eq(schema.crews.id, crewId)).limit(1);
  if (!crew) throw new ServiceError("Crew not found", 404);
  if (!featuresOf(crew.features).pullUpNow) throw new ServiceError("Pull Up Now is off for this crew", 403);
  await resolveVoting(crewId); // expires a Pull Up Now quest whose time is up
  if (await activeNowQuest(crewId)) {
    throw new ServiceError("You're already on a Pull Up Now quest. Finish it or drop it first.", 409);
  }
  const members = await loadMembers(crewId);

  const proposed = await proposeQuests(DEMO_NOW_QUESTS, {
    crewId,
    memberInterests: members.map((m) => (m.interests.length ? m.interests : NO_VIBES)),
    homeLabel: crew.homeLabel,
    homeLat: crew.homeLat,
    homeLng: crew.homeLng,
    radiusKm: crew.radiusKm,
    dayOfWeek: dayOfWeek(),
    searchLat: request.lat,
    searchLng: request.lng,
    now: { minutes: request.minutes, budget: request.budget, note: request.note, locationLabel: request.label },
  });

  const now = Date.now();
  const expiresAt = new Date(now + (request.minutes + NOW_GRACE_MIN) * 60_000);
  return db.transaction(async (tx) => {
    await lockCrew(tx, crewId);
    // Fresh options replace any the crew didn't pick.
    await tx
      .update(schema.quests)
      .set({ status: "expired" })
      .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.kind, "now"), eq(schema.quests.status, "proposed")));
    return tx
      .insert(schema.quests)
      .values(
        proposed.map((q, i) => ({
          crewId,
          kind: "now" as const,
          weekStart: weekStart(),
          status: "proposed" as const,
          expiresAt,
          title: q.title,
          hook: q.hook,
          task: q.task,
          placeName: q.place.name,
          address: q.place.address || null,
          lat: q.place.lat,
          lng: q.place.lng,
          source: "google_maps" as const, // Pull Up Now only searches places
          sourceRef: q.place.source_ref,
          proofHint: q.proof_hint,
          whyThisCrew: q.why_this_crew,
          estCost: q.est_cost,
          timeNeededMin: Math.round(q.time_needed_min),
          createdAt: new Date(now + i),
        })),
      )
      .returning();
  });
}

/** One tap starts a Pull Up Now option for the whole crew: no vote, that's the point. */
export async function startNowQuest(questId: string, userId: string): Promise<Quest> {
  const [quest] = await db.select().from(schema.quests).where(eq(schema.quests.id, questId)).limit(1);
  if (!quest || quest.kind !== "now") throw new ServiceError("Quest not found", 404);
  if (!(await isMember(quest.crewId, userId))) throw new ServiceError("You're not in this crew", 403);

  await db.transaction(async (tx) => {
    await lockCrew(tx, quest.crewId);
    const [current] = await tx.select({ status: schema.quests.status }).from(schema.quests).where(eq(schema.quests.id, questId));
    if (current?.status !== "proposed") throw new ServiceError("Someone already picked, or these options expired", 409);
    await tx.update(schema.quests).set({ status: "active" }).where(eq(schema.quests.id, questId));
    await tx
      .update(schema.quests)
      .set({ status: "expired" })
      .where(
        and(
          eq(schema.quests.crewId, quest.crewId),
          eq(schema.quests.kind, "now"),
          eq(schema.quests.status, "proposed"),
          ne(schema.quests.id, questId),
        ),
      );
  });
  await prepareQuest(questId);
  return { ...quest, status: "active" };
}

/** Drops a Pull Up Now quest (picked or not) so the crew can pull up something else. */
export async function dropNowQuest(questId: string, userId: string): Promise<void> {
  const [quest] = await db.select().from(schema.quests).where(eq(schema.quests.id, questId)).limit(1);
  if (!quest || quest.kind !== "now") throw new ServiceError("Quest not found", 404);
  if (!(await isMember(quest.crewId, userId))) throw new ServiceError("You're not in this crew", 403);
  await db
    .update(schema.quests)
    .set({ status: "expired" })
    .where(
      and(
        eq(schema.quests.crewId, quest.crewId),
        eq(schema.quests.kind, "now"),
        inArray(schema.quests.status, ["proposed", "active"]),
      ),
    );
}
