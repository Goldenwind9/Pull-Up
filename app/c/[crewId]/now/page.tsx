// Now tab: Pull Up Now. Something open and walkable, right now. Only when the crew turned it on.
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { getCrewHome } from "@/lib/services/crews";
import PageTitle from "@/app/components/PageTitle";
import QuestCard from "../QuestCard";
import NowPanel from "../NowPanel";
import AutoRefresh from "../AutoRefresh";

export const dynamic = "force-dynamic";

export default async function NowTab({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const session = await requireMember(crewId).catch(() => null);
  if (!session) notFound();
  const home = await getCrewHome(crewId, session.userId);
  if (!home || !home.features.pullUpNow) notFound();

  return (
    <>
      <PageTitle emoji="⚡" title="Pull Up Now" subtitle="No plan? Something open & walkable, right now." />
      {home.now.active && <QuestCard quest={home.now.active} />}
      <NowPanel
        crewId={crewId}
        home={{ label: home.crew.homeLabel, lat: home.crew.homeLat, lng: home.crew.homeLng }}
        options={home.now.options}
        canPull={home.now.active?.status !== "active"}
      />
      {home.now.active?.status === "active" && <AutoRefresh />}
    </>
  );
}
