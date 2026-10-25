// Crew home: this week's quest, votes, photo feed, stats. Owner: Frontend.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { getCrewHome } from "@/lib/services/crews";
import Blobs from "@/app/components/Blobs";
import BouncyTitle from "@/app/components/BouncyTitle";
import ShareButton from "@/app/components/ShareButton";
import PullUpButton from "./PullUpButton";
import Proposals from "./Proposals";
import QuestCard from "./QuestCard";
import Feed from "./Feed";

export const dynamic = "force-dynamic";

export default async function CrewHome({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const session = await requireMember(crewId).catch(() => null); // bad uuid -> not found
  if (!session) notFound();
  const home = await getCrewHome(crewId, session.userId);
  if (!home) notFound();

  const stats = [
    { label: "week streak", value: home.stats.streak, emoji: "🔥" },
    { label: "quests done", value: home.stats.questsDone, emoji: "🏆" },
    { label: "photos", value: home.stats.photos, emoji: "📸" },
  ];

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col gap-8 px-4 pb-16 pt-10">
      <Blobs />

      <header className="animate-bounce-in text-center">
        <BouncyTitle text={home.crew.name} className="text-5xl" />
        <p className="mt-2 text-lg">
          {home.members.map((m) => m.name).join(" · ")}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <ShareButton url={home.crew.inviteLink} text={`Join ${home.crew.name} on PullUp 🎲`} />
          <Link href={`/c/${crewId}/recap`} className="btn bg-white px-4 py-2">
            Recap 📸
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="sticker animate-bounce-in bg-white p-3 text-center"
            style={{ animationDelay: `${0.1 + i * 0.08}s` }}
          >
            <p className="text-3xl font-bold">
              {s.emoji} {s.value}
            </p>
            <p className="text-sm">{s.label}</p>
          </div>
        ))}
      </div>

      {home.quest ? (
        <QuestCard quest={home.quest} />
      ) : home.proposals.length ? (
        <Proposals
          proposals={home.proposals}
          myVote={home.myVote}
          votesCast={home.votesCast}
          memberCount={home.members.length}
          votingClosesAt={home.votingClosesAt}
        />
      ) : home.canPullUp ? (
        <PullUpButton crewId={crewId} homeLabel={home.crew.homeLabel} />
      ) : (
        <section className="sticker bg-white p-6 text-center text-lg">
          That&apos;s it for this week. New quests drop Monday! 🌅
        </section>
      )}

      <Feed items={home.feed} />
    </main>
  );
}
