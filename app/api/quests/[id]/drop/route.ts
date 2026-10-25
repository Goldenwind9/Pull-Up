// POST: drop the crew's Pull Up Now quest (picked or not) to pull up something else.
import { NextResponse } from "next/server";
import { z } from "zod";
import { dropNowQuest } from "@/lib/services/quests";
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
    await dropNowQuest(id, session.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
