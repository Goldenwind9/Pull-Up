// Monthly recap comic + Share button. Owner: Frontend.
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import ComingSoon from "@/app/components/ComingSoon";

export default async function RecapPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  if (!(await requireMember(crewId))) notFound();

  // TODO(Frontend): show latest recap image (signedUrl), "Make recap" button for the demo,
  // Share button using navigator.share({ files: [image] }) for Instagram Stories / WhatsApp.
  return <ComingSoon title="Recap" emoji="💥" />;
}
