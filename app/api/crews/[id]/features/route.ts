// POST: the creator turns optional features on or off. Body: { pullUpNow, fairMeetup, secretRoles, photoBingo }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { updateFeatures } from "@/lib/services/crews";
import { errorResponse } from "@/lib/services/errors";
import { FeaturesBody } from "@/lib/featuresBody";
import { requireMember } from "@/lib/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  }
  const session = await requireMember(id);
  if (!session) return NextResponse.json({ error: "Join this crew first" }, { status: 403 });
  const parsed = FeaturesBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad input" }, { status: 400 });
  try {
    await updateFeatures(id, session.userId, parsed.data);
    return NextResponse.json({ features: parsed.data });
  } catch (err) {
    return errorResponse(err);
  }
}
