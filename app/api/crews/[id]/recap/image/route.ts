// GET: the latest recap card as a JPEG, for crew members only.
// Served from our own origin so the Share button can turn it into a file.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestRecap } from "@/lib/services/recaps";
import { getObject } from "@/lib/storage";
import { requireMember } from "@/lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success || !(await requireMember(id))) {
    return NextResponse.json({ error: "Join this crew first" }, { status: 403 });
  }
  const recap = await getLatestRecap(id);
  if (!recap?.imageKey) return NextResponse.json({ error: "No recap yet" }, { status: 404 });
  const card = await getObject(recap.imageKey);
  return new Response(new Uint8Array(card), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  });
}
