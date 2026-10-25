// POST: join a crew from an invite link.
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { joinCrew, addMember } from "@/lib/services/crews";
import { getSession, requireMember, setSession } from "@/lib/session";
import { userExists } from "@/lib/db/queries";
import { VIBES, MIN_VIBES, MAX_VIBES } from "@/lib/vibes";

const Body = z.object({
  name: z.string().trim().min(1).max(40),
  interests: z.array(z.enum(VIBES)).min(MIN_VIBES).max(MAX_VIBES),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });

  const [crew] = await db.select().from(schema.crews).where(eq(schema.crews.id, id)).limit(1);
  if (!crew) return NextResponse.json({ error: "Crew not found" }, { status: 404 });

  // Already in this crew: don't create a duplicate person.
  if (await requireMember(id)) return NextResponse.json({ crewId: id });

  // Already signed in from another crew: reuse that person (unless they were deleted).
  const session = await getSession();
  if (session && (await userExists(session.userId))) {
    await addMember(id, session.userId);
    return NextResponse.json({ crewId: id });
  }

  const user = await joinCrew(id, parsed.data.name, parsed.data.interests);
  await setSession(user.id);
  return NextResponse.json({ crewId: id });
}
