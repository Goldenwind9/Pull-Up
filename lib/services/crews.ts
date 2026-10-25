// Crew functions shared by pages, API routes and (later) the Muse connector.
// Owner: Data (queries) + Frontend (callers).
import { customAlphabet } from "nanoid";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logActivity } from "./activity";
import { Share_Tech_Mono } from "next/font/google";
import { act } from "react";

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

//Called by /app/c/[crewId]/page.tsx
//getCrewHome(crewId) -> crew, members, this week's quests + votes,
// active quest, recent proofs, stats from crew_weekly
export async function getCrewHome(crewId: string)
{
  var [crew] = await db
    .select()
    .from(schema.crews)
    .where(eq(schema.crews.id, crewId))
    .limit(1) ?? null;

  //look in table crew_members to find id of users in crews
  var memberIds;
  if (crew)
  {
    memberIds = await db.select()
    .from(schema.crewMembers)
    .where(eq(schema.crewMembers.crewId, crewId));
  }

  var members = [];
  if (memberIds)
  {
    for (const memberId of memberIds)
    {
      const [member] = await db.select()
        .from(schema.users)
        .where(eq(schema.users.id, memberId.userId));
      members.push(member);
    }
  }

  //look in table quests for quests
  const quests = await db.select()
    .from(schema.quests)
    .where(eq(schema.quests.crewId, crewId)) ?? null;
  
  var activeQuest = null;
  for (const quest of quests)
  {
    if (quest.status === "active")
    {
      activeQuest = quest;
      break;
    }
  }

  //look in table quest_votes
  var questVotes = []
  
  questVotes = await db
    .select()
    .from(schema.questVotes)
    .where(eq(schema.questVotes.crewId, crewId));

  var proofs = [];
  //look in table proofs for recent proofs
  if (memberIds)
  {
    for (const memberId of memberIds)
    {
      const userProofs = await db
        .select()
        .from(schema.proofs)
        .where(eq(schema.proofs.userId, memberId.userId));
      for (const proof of userProofs)
      {
        proofs.push(proof);
      }
    }
  }

  //look in table crew_weekly for stats
  const weeklyStats = await db.select()
    .from(schema.crewWeekly)
    .where(eq(schema.crewWeekly.crewId, crewId)) ?? null;

  return {
    "crew": crew,
    "members": members,
    "quests": quests,
    "activeQuest": activeQuest,
    "questVotes": questVotes,
    "proofs": proofs,
    "weeklyStats": weeklyStats
  }
}