// POST: start a Pull Up Now option for the whole crew (one tap, no vote). Returns { quest }.
import { NextResponse } from "next/server";
import { z } from "zod";
import { startNowQuest } from "@/lib/services/quests";
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
    return NextResponse.json({ quest: await startNowQuest(id, session.userId) });
  } catch (err) {
    return errorResponse(err);
  }
}
