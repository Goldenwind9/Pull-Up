// Crew functions shared by pages, API routes and (later) the Muse connector.
// Owner: Data (queries) + Frontend (callers).
import { customAlphabet } from "nanoid";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logActivity } from "./activity";
import { signedUrl } from "@/lib/storage";
import { weekStart, VOTE_WINDOW_MS } from "@/lib/time";
import { resolveVoting, type Quest } from "./quests";

// No look-alike characters (0/O, 1/l), so codes are easy to read aloud.
const inviteCode = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 6);

export async function createCrew(input: {
  name: string;
  homeLabel: string;
  homeLat: number;
  homeLng: number;
  radiusKm?: number;
}) {
  const [crew] = await db
    .insert(schema.crews)
    .values({ ...input, inviteCode: inviteCode() })
    .returning();
  return crew;
}

export async function getCrewByInviteCode(code: string) {
  const [crew] = await db
    .select()
    .from(schema.crews)
    .where(eq(schema.crews.inviteCode, code))
    .limit(1);
  return crew ?? null;
}

/** Creates a user and adds them to the crew. Caller sets the session cookie. */
export async function joinCrew(crewId: string, name: string, interests: string[]) {
  const [user] = await db.insert(schema.users).values({ name, interests }).returning();
  await addMember(crewId, user.id);
  return user;
}

/** Adds an existing user to a crew. Safe to call twice. */
export async function addMember(crewId: string, userId: string) {
  const added = await db
    .insert(schema.crewMembers)
    .values({ crewId, userId })
    .onConflictDoNothing()
    .returning();
  if (added.length) await logActivity({ crewId, userId, kind: "joined" });
}

export function inviteLink(code: string) {
  return `${process.env.APP_URL ?? "https://pull-up.tech"}/j/${code}`;
}

export type FeedItem = {
  id: string;
  questTitle: string;
  userName: string;
  caption: string | null;
  reason: string | null;
  verdict: "pass" | "unsure" | "fail";
  approved: boolean;
  bonus: boolean; // added after the quest was done, so not checked
  mine: boolean;
  photoUrl: string;
  createdAt: string;
};

export type ProposalView = Quest & { votes: number };

export type CrewHome = NonNullable<Awaited<ReturnType<typeof getCrewHome>>>;

/** Mondays (YYYY-MM-DD) one week apart, walking backwards. */
function previousWeek(week: string) {
  const d = new Date(`${week}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 7);
  return d.toISOString().slice(0, 10);
}

/** Weeks in a row with a completed quest (B18). This week counts once it's done; until then the streak runs to last week. */
function streak(doneWeeks: Set<string>, thisWeek: string) {
  let week = doneWeeks.has(thisWeek) ? thisWeek : previousWeek(thisWeek);
  let n = 0;
  while (doneWeeks.has(week)) {
    n++;
    week = previousWeek(week);
  }
  return n;
}

/**
 * Everything the crew home screen shows, for one viewer: the crew, this week's
 * proposals or chosen quest, the photo feed, and stats. Null if the crew doesn't exist.
 */
export async function getCrewHome(crewId: string, viewerId: string) {
  // No cron: closing the vote happens whenever someone looks (B6).
  const chosen = await resolveVoting(crewId);
  const week = weekStart();

  const [crew] = await db.select().from(schema.crews).where(eq(schema.crews.id, crewId)).limit(1);
  if (!crew) return null;

  const [members, thisWeek, votes, proofRows, doneWeeks, [totals]] = await Promise.all([
    db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.crewMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.crewMembers.userId))
      .where(eq(schema.crewMembers.crewId, crewId))
      .orderBy(asc(schema.crewMembers.joinedAt)),
    db
      .select()
      .from(schema.quests)
      .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.weekStart, week)))
      .orderBy(asc(schema.quests.createdAt)),
    db
      .select({ questId: schema.questVotes.questId, userId: schema.questVotes.userId })
      .from(schema.questVotes)
      .where(and(eq(schema.questVotes.crewId, crewId), eq(schema.questVotes.weekStart, week))),
    db
      .select({
        proof: schema.proofs,
        questTitle: schema.quests.title,
        userName: schema.users.name,
      })
      .from(schema.proofs)
      .innerJoin(schema.quests, eq(schema.quests.id, schema.proofs.questId))
      .innerJoin(schema.users, eq(schema.users.id, schema.proofs.userId))
      .where(eq(schema.quests.crewId, crewId))
      .orderBy(desc(schema.proofs.createdAt))
      .limit(12),
    db
      .selectDistinct({ week: schema.quests.weekStart })
      .from(schema.quests)
      .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.status, "done"))),
    db
      .select({
        questsDone: sql<number>`coalesce(sum(${schema.crewWeekly.questsDone}), 0)::int`,
        photos: sql<number>`coalesce(sum(${schema.crewWeekly.photos}), 0)::int`,
        votes: sql<number>`coalesce(sum(${schema.crewWeekly.votes}), 0)::int`,
      })
      .from(schema.crewWeekly)
      .where(eq(schema.crewWeekly.crewId, crewId)),
  ]);

  const proposals: ProposalView[] = chosen
    ? []
    : thisWeek
        .filter((q) => q.status === "proposed")
        .map((q) => ({ ...q, votes: votes.filter((v) => v.questId === q.id).length }));

  const feed: FeedItem[] = await Promise.all(
    proofRows.map(async ({ proof, questTitle, userName }) => ({
      id: proof.id,
      questTitle,
      userName,
      caption: proof.caption,
      reason: proof.reason,
      verdict: proof.verdict,
      approved: Boolean(proof.approvedBy),
      bonus: proof.verdict === "pass" && proof.confidence === null,
      mine: proof.userId === viewerId,
      photoUrl: await signedUrl(proof.photoKey),
      createdAt: proof.createdAt.toISOString(),
    })),
  );

  return {
    crew: { id: crew.id, name: crew.name, homeLabel: crew.homeLabel, inviteLink: inviteLink(crew.inviteCode) },
    members,
    viewerId,
    // Nothing this week yet: show the Pull up button.
    canPullUp: thisWeek.length === 0,
    proposals,
    myVote: votes.find((v) => v.userId === viewerId)?.questId ?? null,
    votesCast: votes.length,
    votingClosesAt: proposals.length
      ? new Date(proposals[0].createdAt.getTime() + VOTE_WINDOW_MS).toISOString()
      : null,
    quest: chosen,
    feed,
    stats: { ...totals, streak: streak(new Set(doneWeeks.map((d) => d.week)), week) },
  };
}
