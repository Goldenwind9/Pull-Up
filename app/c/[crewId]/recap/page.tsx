// Recap tab: photo collage + Share button, and the secret roles reveal. Owner: Frontend.
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { getLatestRecap, getRecapRoles, recapImageUrl } from "@/lib/services/recaps";
import { featuresOf } from "@/lib/features";
import PageTitle from "@/app/components/PageTitle";
import RecapView from "./RecapView";

export const dynamic = "force-dynamic";

export default async function RecapPage({ params }: { params: Promise<{ crewId: string }> }) {
  const { crewId } = await params;
  if (!(await requireMember(crewId).catch(() => null))) notFound();

  const [[crew], recap] = await Promise.all([
    db
      .select({ name: schema.crews.name, features: schema.crews.features })
      .from(schema.crews)
      .where(eq(schema.crews.id, crewId))
      .limit(1),
    getLatestRecap(crewId),
  ]);
  if (!crew) notFound();
  const roles = recap && featuresOf(crew.features).secretRoles ? await getRecapRoles(recap.id) : [];
  // Grouped by hand: Map.groupBy needs Node 21+, the server may run Node 20.
  const byQuest = new Map<string, typeof roles>();
  for (const r of roles) byQuest.set(r.quest, [...(byQuest.get(r.quest) ?? []), r]);

  return (
    <>
      <PageTitle emoji="💥" title="Recap" subtitle="Your best shots, captioned by AI." />
      <RecapView crewId={crewId} crewName={crew.name} imageUrl={recap ? recapImageUrl(recap) : null} />

      {roles.length > 0 && (
        <section className="sticker animate-bounce-in bg-ink p-5 text-cream">
          <h2 className="text-2xl font-bold">🤫 Secret roles revealed</h2>
          {[...byQuest].map(([quest, questRoles], i) => (
            <details key={quest} open={i === 0} className="group mt-4">
              <summary className="cursor-pointer list-none text-sm font-bold uppercase tracking-wide opacity-80">
                <span className="inline-block transition-transform group-open:rotate-90">▶</span> {quest} · {questRoles.length} roles
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {questRoles.map((r) => (
                  <li key={r.name} className="rounded-xl border-2 border-cream/40 p-3">
                    <b>
                      {r.name} was {r.emoji} {r.role}
                    </b>
                    <span className="mt-1 block text-sm opacity-90">Mission: {r.mission}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </section>
      )}
    </>
  );
}
