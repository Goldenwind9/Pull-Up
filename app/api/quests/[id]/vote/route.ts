// POST: cast a vote (lib/services/quests.castVote). Owner: Data.
// Returns { activeQuest } once this vote closed voting, otherwise { activeQuest: null }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { castVote } from "@/lib/services/quests";
import { errorResponse } from "@/lib/services/errors";
import { getSession } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Quest not found" }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Join a crew first" }, { status: 401 });
  try {
    const activeQuest = await castVote(id, session.userId);
    return NextResponse.json({ activeQuest });
  } catch (err) {
    return errorResponse(err);
  }
}
