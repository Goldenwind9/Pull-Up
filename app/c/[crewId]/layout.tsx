// Shared frame for every crew screen: compact header + bottom tab bar. Members only.
import { notFound } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireMember } from "@/lib/session";
import { featuresOf } from "@/lib/features";
import Blobs from "@/app/components/Blobs";
import TabBar, { type Tab } from "./TabBar";

export default async function CrewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ crewId: string }>;
}) {
  const { crewId } = await params;
  if (!(await requireMember(crewId).catch(() => null))) notFound(); // bad uuid -> not found
  const [crew] = await db
    .select({ name: schema.crews.name, features: schema.crews.features })
    .from(schema.crews)
    .where(eq(schema.crews.id, crewId))
    .limit(1);
  if (!crew) notFound();
  const features = featuresOf(crew.features);

  // A dot on the Now tab while a Pull Up Now quest is being played.
  const [nowLive] = features.pullUpNow
    ? await db
        .select({ id: schema.quests.id })
        .from(schema.quests)
        .where(
          and(
            eq(schema.quests.crewId, crewId),
            eq(schema.quests.kind, "now"),
            eq(schema.quests.status, "active"),
            gt(schema.quests.expiresAt, new Date()),
          ),
        )
        .limit(1)
    : [];

  const base = `/c/${crewId}`;
  const tabs: Tab[] = [
    { href: base, emoji: "🎲", label: "Quest" },
    ...(features.pullUpNow ? [{ href: `${base}/now`, emoji: "⚡", label: "Now", dot: Boolean(nowLive) }] : []),
    { href: `${base}/feed`, emoji: "📸", label: "Feed" },
    { href: `${base}/recap`, emoji: "💥", label: "Recap" },
    { href: `${base}/crew`, emoji: "👥", label: "Crew" },
  ];

  return (
    <>
      <Blobs />
      <header className="mx-auto max-w-md px-4 pt-5">
        <p className="sticker inline-block -rotate-1 bg-white px-3 py-1 text-lg font-bold">{crew.name}</p>
      </header>
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 pb-32 pt-5">{children}</main>
      <TabBar tabs={tabs} />
    </>
  );
}
