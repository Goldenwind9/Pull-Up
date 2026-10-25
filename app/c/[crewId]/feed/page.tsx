// Feed tab: every photo the crew took, with AI captions, fun facts and Approve buttons.
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { getCrewHome } from "@/lib/services/crews";
import PageTitle from "@/app/components/PageTitle";
import Feed from "../Feed";
import AutoRefresh from "../AutoRefresh";

export const dynamic = "force-dynamic";

export default async function FeedTab({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const session = await requireMember(crewId).catch(() => null);
  if (!session) notFound();
  const home = await getCrewHome(crewId, session.userId);
  if (!home) notFound();
  const live = home.quest?.status === "active" || home.now.active?.status === "active";

  return (
    <>
      <PageTitle emoji="📸" title="Feed" subtitle="Proof, captions, and the occasional roast." />
      {home.feed.length ? (
        <Feed items={home.feed} />
      ) : (
        <section className="sticker bg-white p-6 text-center text-lg">No photos yet. Go pull up somewhere! 📸</section>
      )}
      {live && <AutoRefresh />}
    </>
  );
}
