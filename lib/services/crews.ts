// Crew functions shared by pages, API routes and (later) the Muse connector.
// Owner: Data (queries) + Frontend (callers).
import { customAlphabet } from "nanoid";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logActivity } from "./activity";
import { ServiceError } from "./errors";
import { featuresOf, type Features } from "@/lib/features";
import { signedUrl } from "@/lib/storage";
import { weekStart, VOTE_WINDOW_MS } from "@/lib/time";
import { resolveVoting, type Quest } from "./quests";
import { prepareQuest } from "./questExtras";

// No look-alike characters (0/O, 1/l), so codes are easy to read aloud.
const inviteCode = customAlphabet("23456789abcdefghjkmnpqrstuvwxyz", 6);

export async function createCrew(input: {
  name: string;
  homeLabel: string;
  homeLat: number;
  homeLng: number;
  radiusKm?: number;
  features?: Features;
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
  funFact: string | null; // from Google Lens + the model, filled in a few seconds after upload
  mine: boolean;
  photoUrl: string;
  createdAt: string;
};

export type ProposalView = Quest & { votes: number };

export type BingoView = { idx: number; prompt: string; by: string | null; photoUrl: string | null };

/** A started quest as one viewer sees it: their own secret role only, and the bingo board. */
export type QuestView = Quest & {
  myRole: { role: string; emoji: string; mission: string } | null;
  rolesDealt: number;
  bingo: BingoView[];
};

/** Only the crew's creator changes its optional features (anyone, for crews with no recorded creator). */
export async function updateFeatures(crewId: string, userId: string, features: Features) {
  const [crew] = await db.select().from(schema.crews).where(eq(schema.crews.id, crewId)).limit(1);
  if (!crew) throw new ServiceError("Crew not found", 404);
  if (crew.createdBy && crew.createdBy !== userId) {
    throw new ServiceError("Only the person who made the crew can change this", 403);
  }
  await db.update(schema.crews).set({ features }).where(eq(schema.crews.id, crewId));
}

/** Saves where a member usually starts from (fair meetup). */
export async function setStart(crewId: string, userId: string, start: { label: string; lat: number; lng: number }) {
  await db
    .update(schema.crewMembers)
    .set({ startLabel: start.label, startLat: start.lat, startLng: start.lng })
    .where(and(eq(schema.crewMembers.crewId, crewId), eq(schema.crewMembers.userId, userId)));
}

async function questViews(quests: Quest[], viewerId: string, features: Features): Promise<Map<string, QuestView>> {
  const ids = quests.map((q) => q.id);
  if (!ids.length) return new Map();
  // Started quests get their roles and bingo card (no-op once dealt; deals late joiners in).
  await Promise.all(quests.filter((q) => q.status === "active").map((q) => prepareQuest(q.id)));
  const [roles, squares] = await Promise.all([
    db.select().from(schema.questRoles).where(inArray(schema.questRoles.questId, ids)),
    db
      .select({
        questId: schema.bingoSquares.questId,
        idx: schema.bingoSquares.idx,
        prompt: schema.bingoSquares.prompt,
        photoKey: schema.proofs.photoKey,
        by: schema.users.name,
      })
      .from(schema.bingoSquares)
      .leftJoin(schema.proofs, eq(schema.proofs.id, schema.bingoSquares.proofId))
      .leftJoin(schema.users, eq(schema.users.id, schema.proofs.userId))
      .where(inArray(schema.bingoSquares.questId, ids))
      .orderBy(asc(schema.bingoSquares.idx)),
  ]);
  const views = new Map<string, QuestView>();
  for (const q of quests) {
    const mine = roles.find((r) => r.questId === q.id && r.userId === viewerId);
    // A feature switched off after it was dealt just disappears from view.
    views.set(q.id, {
      ...q,
      travel: features.fairMeetup ? q.travel : null,
      myRole: mine && features.secretRoles ? { role: mine.role, emoji: mine.emoji, mission: mine.mission } : null,
      rolesDealt: features.secretRoles ? roles.filter((r) => r.questId === q.id).length : 0,
      bingo: await Promise.all(
        squares
          .filter((b) => features.photoBingo && b.questId === q.id)
          .map(async (b) => ({
            idx: b.idx,
            prompt: b.prompt,
            by: b.by,
            photoUrl: b.photoKey ? await signedUrl(b.photoKey) : null,
          })),
      ),
    });
  }
  return views;
}

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
  const features = featuresOf(crew.features);

  const [members, thisWeek, nowQuests, votes, proofRows, doneWeeks, [totals]] = await Promise.all([
    db
      .select({ id: schema.users.id, name: schema.users.name, startLabel: schema.crewMembers.startLabel })
      .from(schema.crewMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.crewMembers.userId))
      .where(eq(schema.crewMembers.crewId, crewId))
      .orderBy(asc(schema.crewMembers.joinedAt)),
    db
      .select()
      .from(schema.quests)
      .where(and(eq(schema.quests.crewId, crewId), eq(schema.quests.weekStart, week), eq(schema.quests.kind, "weekly")))
      .orderBy(asc(schema.quests.createdAt)),
    // Pull Up Now: unpicked options, and the one being played or just finished, until its time is up.
    db
      .select()
      .from(schema.quests)
      .where(
        and(
          eq(schema.quests.crewId, crewId),
          eq(schema.quests.kind, "now"),
          inArray(schema.quests.status, ["proposed", "active", "done"]),
          gt(schema.quests.expiresAt, new Date()),
        ),
      )
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
        .map((q) => ({
          ...q,
          travel: features.fairMeetup ? q.travel : null,
          votes: votes.filter((v) => v.questId === q.id).length,
        }));

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
      funFact: features.photoBingo ? proof.funFact : null,
      mine: proof.userId === viewerId,
      photoUrl: await signedUrl(proof.photoKey),
      createdAt: proof.createdAt.toISOString(),
    })),
  );

  // The latest one picked; a finished one stays on screen (bonus photos, bingo) until its time is up.
  const nowActive = features.pullUpNow
    ? (nowQuests.filter((q) => q.status === "active" || q.status === "done").at(-1) ?? null)
    : null;
  const views = await questViews([chosen, nowActive].filter((q): q is Quest => q !== null), viewerId, features);

  return {
    crew: {
      id: crew.id,
      name: crew.name,
      homeLabel: crew.homeLabel,
      homeLat: crew.homeLat,
      homeLng: crew.homeLng,
      inviteLink: inviteLink(crew.inviteCode),
    },
    members,
    viewerId,
    features,
    // Crews with no recorded creator: anyone can change the features.
    isCreator: !crew.createdBy || crew.createdBy === viewerId,
    myStart: members.find((m) => m.id === viewerId)?.startLabel ?? null,
    // Nothing this week yet: show the Pull up button.
    canPullUp: thisWeek.length === 0,
    proposals,
    myVote: votes.find((v) => v.userId === viewerId)?.questId ?? null,
    votesCast: votes.length,
    votingClosesAt: proposals.length
      ? new Date(proposals[0].createdAt.getTime() + VOTE_WINDOW_MS).toISOString()
      : null,
    quest: chosen ? views.get(chosen.id)! : null,
    now: {
      active: nowActive ? views.get(nowActive.id)! : null,
      options: features.pullUpNow ? nowQuests.filter((q) => q.status === "proposed") : [],
    },
    feed,
    stats: { ...totals, streak: streak(new Set(doneWeeks.map((d) => d.week)), week) },
  };
}
