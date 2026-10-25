// POST: build this month's recap (lib/services/recaps.makeRecap). GET: latest recap. Owner: AI.
import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestRecap, makeRecap, recapImageUrl, type Recap } from "@/lib/services/recaps";
import { errorResponse } from "@/lib/services/errors";
import { requireMember } from "@/lib/session";

function toJson(recap: Recap) {
  return {
    id: recap.id,
    periodStart: recap.periodStart,
    periodEnd: recap.periodEnd,
    script: recap.script,
    imageUrl: recapImageUrl(recap),
    createdAt: recap.createdAt,
  };
}

async function member(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return requireMember(id);
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await member(id);
  if (!session) return NextResponse.json({ error: "Join this crew first" }, { status: 403 });
  try {
    return NextResponse.json({ recap: toJson(await makeRecap(id, session.userId)) });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await member(id))) return NextResponse.json({ error: "Join this crew first" }, { status: 403 });
  const recap = await getLatestRecap(id);
  return NextResponse.json({ recap: recap ? toJson(recap) : null });
}
