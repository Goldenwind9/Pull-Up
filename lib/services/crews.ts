// Crew functions shared by pages, API routes and (later) the Muse connector.
// Owner: Data (queries) + Frontend (callers).
import { customAlphabet } from "nanoid";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logActivity } from "./activity";

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

// TODO(Data): getCrewHome(crewId) -> crew, members, this week's quests + votes,
// active quest, recent proofs, stats from crew_weekly.
