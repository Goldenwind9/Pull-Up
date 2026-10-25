// POST: create a crew. The creator joins it in the same step.
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { createCrew, joinCrew, inviteLink } from "@/lib/services/crews";
import { setSession } from "@/lib/session";
import { VIBES, MIN_VIBES, MAX_VIBES } from "@/lib/vibes";

const Body = z.object({
  crewName: z.string().trim().min(1).max(60),
  homeLabel: z.string().min(1),
  homeLat: z.number(),
  homeLng: z.number(),
  yourName: z.string().trim().min(1).max(40),
  interests: z.array(z.enum(VIBES)).min(MIN_VIBES).max(MAX_VIBES),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
  const b = parsed.data;

  const crew = await createCrew({
    name: b.crewName,
    homeLabel: b.homeLabel,
    homeLat: b.homeLat,
    homeLng: b.homeLng,
  });
  const user = await joinCrew(crew.id, b.yourName, b.interests);
  await db.update(schema.crews).set({ createdBy: user.id }).where(eq(schema.crews.id, crew.id));
  await setSession(user.id);

  return NextResponse.json({ crewId: crew.id, inviteLink: inviteLink(crew.inviteCode) });
}
