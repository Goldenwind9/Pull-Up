// POST: upload a proof photo (multipart, field "photo") -> store -> verify. Owner: Data + AI.
// Returns { proof } with the verdict and caption.
import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_PHOTO_BYTES, submitProof } from "@/lib/services/proofs";
import { errorResponse } from "@/lib/services/errors";
import { getSession } from "@/lib/session";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Quest not found" }, { status: 404 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Join a crew first" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const photo = form?.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    return NextResponse.json({ error: "Attach a photo" }, { status: 400 });
  }
  if (photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ error: "That photo is too big (15 MB max)" }, { status: 413 });
  }

  try {
    const proof = await submitProof(id, session.userId, Buffer.from(await photo.arrayBuffer()));
    return NextResponse.json({ proof });
  } catch (err) {
    return errorResponse(err);
  }
}
