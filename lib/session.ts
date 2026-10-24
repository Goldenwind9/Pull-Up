// Signed session cookie. No passwords: you get a cookie when you join a crew.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

const COOKIE = "pullup_session";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not set. Copy .env.example to .env and fill it in.");
  return new TextEncoder().encode(value);
}

export type Session = { userId: string };

export async function setSession(userId: string) {
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.userId === "string" ? { userId: payload.userId } : null;
  } catch {
    return null;
  }
}

/** Returns the session if the caller is in the crew, otherwise null. */
export async function requireMember(crewId: string): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;
  const [row] = await db
    .select()
    .from(schema.crewMembers)
    .where(
      and(eq(schema.crewMembers.crewId, crewId), eq(schema.crewMembers.userId, session.userId)),
    )
    .limit(1);
  return row ? session : null;
}
