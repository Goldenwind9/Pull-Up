// Join from invite link: pull-up.tech/j/CODE. Owner: Frontend.
import { notFound, redirect } from "next/navigation";
import { getCrewByInviteCode } from "@/lib/services/crews";
import { requireMember } from "@/lib/session";
import Blobs from "@/app/components/Blobs";
import JoinForm from "./JoinForm";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const crew = await getCrewByInviteCode(code);
  if (!crew) notFound();
  // Already in this crew (e.g. tapped the invite link again): go straight home.
  if (await requireMember(crew.id)) redirect(`/c/${crew.id}`);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-12">
      <Blobs />
      <header className="animate-bounce-in text-center">
        <span className="inline-block animate-letter text-6xl">👋</span>
        <p className="mt-2 text-lg font-medium">You&apos;ve been summoned to</p>
        <h1 className="sticker mt-2 inline-block rotate-[-2deg] bg-sun px-5 py-2 text-4xl font-bold">
          {crew.name}
        </h1>
      </header>
      <section className="sticker animate-bounce-in bg-white p-5" style={{ animationDelay: "0.2s" }}>
        <JoinForm crewId={crew.id} />
      </section>
    </main>
  );
}
