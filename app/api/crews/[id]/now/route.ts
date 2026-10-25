// POST: Pull Up Now. 3 options open right now and walkable from where the crew is.
// Body: { minutes, budget, lat, lng, label, note? }. Returns { quests }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateNowQuests } from "@/lib/services/quests";
import { errorResponse } from "@/lib/services/errors";
import { requireMember } from "@/lib/session";

const Body = z.object({
  minutes: z.number().int().min(30).max(360),
  budget: z.number().int().min(0).max(500),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().trim().min(1).max(60),
  note: z.string().trim().max(140).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  }
  if (!(await requireMember(id))) {
    return NextResponse.json({ error: "Join this crew first" }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
  try {
    return NextResponse.json({ quests: await generateNowQuests(id, parsed.data) });
  } catch (err) {
    return errorResponse(err);
  }
}
