// POST: run the quest agent for this crew (lib/services/quests.generateQuests). Owner: AI.
import { NextResponse } from "next/server";
import { z } from "zod";
import { generateQuests } from "@/lib/services/quests";
import { errorResponse } from "@/lib/services/errors";
import { requireMember } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Crew not found" }, { status: 404 });
  }
  if (!(await requireMember(id))) {
    return NextResponse.json({ error: "Join this crew first" }, { status: 403 });
  }
  try {
    const quests = await generateQuests(id);
    return NextResponse.json({ quests });
  } catch (err) {
    return errorResponse(err);
  }
}
