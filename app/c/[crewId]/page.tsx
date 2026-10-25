// Quest tab: this week's quest (Pull up, voting, the active quest). Owner: Frontend.
// The frame (header, tabs, membership check) is in layout.tsx.
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { getCrewHome } from "@/lib/services/crews";
import PageTitle from "@/app/components/PageTitle";
import PullUpButton from "./PullUpButton";
import Proposals from "./Proposals";
import QuestCard from "./QuestCard";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

export default async function QuestTab({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const session = await requireMember(crewId).catch(() => null);
  if (!session) notFound();
  const home = await getCrewHome(crewId, session.userId);
  if (!home) notFound();

  return (
    <>
      <PageTitle emoji="🎲" title="This week" subtitle="One side quest, voted by the crew." />

      {home.now.active?.status === "active" && (
        <Link href={`/c/${crewId}/now`} className="sticker animate-bounce-in block bg-ink p-4 text-cream">
          ⚡ <b>Pull Up Now is on:</b> {home.now.active.title} →
        </Link>
      )}
      {home.features.fairMeetup && !home.myStart && (
        <Link href={`/c/${crewId}/crew`} className="sticker block bg-cream p-4">
          🧭 <b>Where do you start from?</b> Set it in the Crew tab so quests are a fair trip for everyone →
        </Link>
      )}

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

      {/* Live while something's happening: votes, bingo, photos. */}
      {(home.quest?.status === "active" || home.proposals.length > 0) && <AutoRefresh />}
    </>
  );
}
