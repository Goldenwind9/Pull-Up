// Crew tab: stats, members, invite link, your starting area, and the crew's optional features.
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { getCrewHome } from "@/lib/services/crews";
import PageTitle from "@/app/components/PageTitle";
import ShareButton from "@/app/components/ShareButton";
import StartPicker from "../StartPicker";
import CrewSettings from "./CrewSettings";

export const dynamic = "force-dynamic";

export default async function CrewTab({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  const session = await requireMember(crewId).catch(() => null);
  if (!session) notFound();
  const home = await getCrewHome(crewId, session.userId);
  if (!home) notFound();

  const stats = [
    { label: "week streak", value: home.stats.streak, emoji: "🔥" },
    { label: "quests done", value: home.stats.questsDone, emoji: "🏆" },
    { label: "photos", value: home.stats.photos, emoji: "📸" },
  ];

  return (
    <>
      <PageTitle emoji="👥" title="Crew" subtitle={`${home.members.length} members · ${home.crew.homeLabel}`} />

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

      <section className="sticker bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Members</h2>
          <ShareButton url={home.crew.inviteLink} text={`Join ${home.crew.name} on PullUp 🎲`} label="Invite 🔗" className="bg-sky px-3 py-1 text-sm" />
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {home.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-xl border-2 border-ink bg-cream px-3 py-2">
              <span className="font-semibold">
                {m.name}
                {m.id === home.viewerId && " (you)"}
              </span>
              {home.features.fairMeetup && <span className="text-sm">🧭 {m.startLabel ?? "start not set"}</span>}
            </li>
          ))}
        </ul>
      </section>

      {home.features.fairMeetup && <StartPicker crewId={crewId} current={home.myStart} />}

      <CrewSettings crewId={crewId} features={home.features} canEdit={home.isCreator} />
    </>
  );
}
