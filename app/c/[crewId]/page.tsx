// Crew home: this week's quest, votes, photo feed, stats. Owner: Frontend.
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import ComingSoon from "@/app/components/ComingSoon";

export default async function CrewHome({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  if (!(await requireMember(crewId))) notFound();

  // TODO(Frontend): load getCrewHome(crewId) and show:
  // - "Pull up" button when there's no quest this week
  // - 3 proposals with vote buttons while voting is open
  // - active quest card: place, address, "Open in Google Maps" link, cost, proof hint
  // - "We pulled up" photo upload, feed of captions, Approve on unsure photos
  // - streak + totals from crew_weekly
  return <ComingSoon title="Crew home" emoji="🗺️" />;
}
