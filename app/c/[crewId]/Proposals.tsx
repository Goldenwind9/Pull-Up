"use client";
// This week's 3 proposals. One tap votes; the page refreshes to show counts or the winner.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";
import type { ProposalView } from "@/lib/services/crews";

const COLORS = ["bg-sun", "bg-sky", "bg-white"];
const TILTS = ["-1.5deg", "1deg", "-0.5deg"];

export default function Proposals({
  proposals,
  myVote,
  votesCast,
  memberCount,
  votingClosesAt,
}: {
  proposals: ProposalView[];
  myVote: string | null;
  votesCast: number;
  memberCount: number;
  votingClosesAt: string | null;
}) {
  const router = useRouter();
  const [voting, setVoting] = useState<string | null>(null);
  const [error, setError] = useState("");
  const needed = Math.floor(memberCount / 2) + 1;
  const closes = votingClosesAt
    ? new Date(votingClosesAt).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
    : null;

  async function vote(questId: string) {
    setError("");
    setVoting(questId);
    const res = await post(`/api/quests/${questId}/vote`);
    setVoting(null);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-3xl font-bold">Pick this week&apos;s quest</h2>
        <p className="mt-1">
          {votesCast}/{needed} votes to lock it in{closes ? `, or the top pick wins ${closes}` : ""}.
        </p>
      </div>

      {proposals.map((q, i) => {
        const mine = myVote === q.id;
        return (
          <article
            key={q.id}
            className={`sticker animate-bounce-in p-5 ${COLORS[i % COLORS.length]}`}
            style={{ rotate: TILTS[i % TILTS.length], animationDelay: `${i * 0.1}s` }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-2xl font-bold leading-tight">{q.title}</h3>
              <span className="shrink-0 rounded-full border-2 border-ink bg-white px-3 py-0.5 font-bold">
                {q.votes} 🗳️
              </span>
            </div>
            {q.hook && <p className="mt-2 text-lg italic">“{q.hook}”</p>}
            <p className="mt-3">
              📍 <b>{q.placeName}</b>
              {q.address ? ` · ${q.address}` : ""}
            </p>
            <p className="mt-1 text-sm">
              {q.estCost && <>💸 {q.estCost} · </>}
              {q.timeNeededMin && <>⏱️ {Math.round(q.timeNeededMin / 6) / 10} h · </>}
              {q.whyThisCrew}
            </p>
            {myVote ? (
              mine && <p className="mt-4 font-bold">✓ Your vote</p>
            ) : (
              <button
                onClick={() => vote(q.id)}
                disabled={voting !== null}
                className="btn mt-4 w-full bg-ink px-4 py-3 text-lg text-cream disabled:opacity-60"
              >
                {voting === q.id ? <span className="inline-block animate-spin-slow">🌀</span> : "Vote for this"}
              </button>
            )}
          </article>
        );
      })}

      {error && <p className="animate-shake text-center font-semibold text-red-600">{error}</p>}
    </section>
  );
}
