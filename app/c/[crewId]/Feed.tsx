"use client";
// Crew photo feed with AI captions. Unsure photos get an Approve button for everyone but the uploader.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";
import type { FeedItem } from "@/lib/services/crews";

const BADGE = {
  pass: "✅ Verified",
  unsure: "🤔 Needs a crewmate",
  fail: "❌ Didn't count",
};

export default function Feed({ items }: { items: FeedItem[] }) {
  const router = useRouter();
  const [approving, setApproving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function approve(id: string) {
    setError("");
    setApproving(id);
    const res = await post(`/api/proofs/${id}/approve`);
    setApproving(null);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  if (!items.length) return null;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-2xl font-bold">Crew feed</h2>
      {error && <p className="animate-shake font-semibold text-red-600">{error}</p>}
      {items.map((p, i) => (
        <article
          key={p.id}
          className="sticker animate-bounce-in overflow-hidden bg-white"
          style={{ rotate: i % 2 ? "0.8deg" : "-0.8deg" }}
        >
          {/* Signed storage links change every load, so next/image's cache doesn't help here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.photoUrl} alt={`${p.userName}'s photo for ${p.questTitle}`} className="aspect-[4/3] w-full object-cover" />
          <div className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <b>{p.userName}</b> · {p.questTitle}
              </span>
              <span className="rounded-full border-2 border-ink px-2 py-0.5 font-semibold">
                {p.approved ? "👍 Crew approved" : p.bonus ? "📸 Bonus" : BADGE[p.verdict]}
              </span>
            </div>
            {p.caption && <p className="mt-2 text-lg italic">“{p.caption}”</p>}
            {p.verdict === "unsure" && !p.approved && (
              p.mine ? (
                <p className="mt-2 text-sm">Waiting for a crewmate to approve.</p>
              ) : (
                <button
                  onClick={() => approve(p.id)}
                  disabled={approving !== null}
                  className="btn mt-3 bg-sun px-4 py-2 disabled:opacity-60"
                >
                  {approving === p.id ? "Approving…" : "Approve 👍"}
                </button>
              )
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
