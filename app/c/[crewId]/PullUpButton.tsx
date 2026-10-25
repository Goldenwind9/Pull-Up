"use client";
// The big "Pull up" button. The quest agent takes 20-60 s, so we keep people entertained.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";

const LOADING_LINES = [
  "Scouting real spots nearby…",
  "Checking what's happening this week…",
  "Reading everyone's vibes…",
  "Arguing about tacos…",
  "Cooking up 3 side quests…",
];

export default function PullUpButton({ crewId, homeLabel }: { crewId: string; homeLabel: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [line, setLine] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 3500);
    return () => clearInterval(timer);
  }, [loading]);

  async function pullUp() {
    setError("");
    setLoading(true);
    const res = await post(`/api/crews/${crewId}/generate`);
    if (!res.ok) {
      setLoading(false);
      return setError(res.error);
    }
    router.refresh();
  }

  return (
    <section className="sticker animate-bounce-in bg-white p-6 text-center">
      <p className="text-lg">No quest yet this week around {homeLabel}.</p>
      <button
        onClick={pullUp}
        disabled={loading}
        className="btn mt-5 w-full bg-sun px-6 py-6 text-3xl disabled:opacity-80"
      >
        {loading ? <span className="inline-block animate-spin-slow">🌀</span> : "Pull up 🎲"}
      </button>
      {loading && (
        <p key={line} className="mt-4 animate-pop font-semibold">
          {LOADING_LINES[line]}
        </p>
      )}
      {error && <p className="mt-4 animate-shake font-semibold text-red-600">{error}</p>}
    </section>
  );
}
