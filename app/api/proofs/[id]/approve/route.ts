// POST: a crew member approves an "unsure" photo, which completes the quest. Owner: Data.
import { NextResponse } from "next/server";
import { z } from "zod";
import { approveProof } from "@/lib/services/proofs";
import { errorResponse } from "@/lib/services/errors";
import { getSession } from "@/lib/session";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Join a crew first" }, { status: 401 });
  try {
    const proof = await approveProof(id, session.userId);
    return NextResponse.json({ proof });
  } catch (err) {
    return errorResponse(err);
  }
}
