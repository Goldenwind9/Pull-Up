// Recap photo collage + Share button. Owner: Frontend.
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { getLatestRecap, recapImageUrl } from "@/lib/services/recaps";
import Blobs from "@/app/components/Blobs";
import BouncyTitle from "@/app/components/BouncyTitle";
import RecapView from "./RecapView";

export const dynamic = "force-dynamic";

export default async function RecapPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  if (!(await requireMember(crewId).catch(() => null))) notFound();

  const [[crew], recap] = await Promise.all([
    db.select({ name: schema.crews.name }).from(schema.crews).where(eq(schema.crews.id, crewId)).limit(1),
    getLatestRecap(crewId),
  ]);
  if (!crew) notFound();

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pb-16 pt-10">
      <Blobs />
      <header className="animate-bounce-in text-center">
        <Link href={`/c/${crewId}`} className="btn inline-block bg-white px-4 py-1 text-sm">
          ← {crew.name}
        </Link>
        <BouncyTitle text="The Recap" className="mt-4 text-5xl" />
        <p className="mt-2 text-lg">Your best shots, captioned by AI.</p>
      </header>
      <RecapView crewId={crewId} crewName={crew.name} imageUrl={recap ? recapImageUrl(recap) : null} />
    </main>
  );
}
