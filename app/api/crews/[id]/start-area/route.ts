// POST: where I usually start from (fair meetup). Body: { label, lat, lng }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { setStart } from "@/lib/services/crews";
import { requireMember } from "@/lib/session";
import { crewFeatures } from "@/lib/db/queries";

const Body = z.object({
  label: z.string().trim().min(1).max(60),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  }
  const session = await requireMember(id);
  if (!session) return NextResponse.json({ error: "Join this crew first" }, { status: 403 });
  if (!(await crewFeatures(id)).fairMeetup) {
    return NextResponse.json({ error: "Fair meetup is off for this crew" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
  await setStart(id, session.userId, parsed.data);
  return NextResponse.json({ ok: true });
}
