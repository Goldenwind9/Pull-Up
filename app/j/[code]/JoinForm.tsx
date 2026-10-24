"use client";
// Name + vibe chips. Chips pop and change color when picked.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { VIBES, MIN_VIBES, MAX_VIBES } from "@/lib/vibes";

const PICKED_COLORS = ["bg-sun", "bg-sky", "bg-ink text-cream"];
const TILTS = ["-3deg", "2deg", "-1deg", "3deg", "-2deg"];

export default function JoinForm({ crewId }: { crewId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function toggle(vibe: string) {
    setPicked((p) =>
      p.includes(vibe) ? p.filter((v) => v !== vibe) : p.length < MAX_VIBES ? [...p, vibe] : p,
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch(`/api/crews/${crewId}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, interests: picked }),
    });
    if (!res.ok) {
      setLoading(false);
      return setError("Something went wrong. Try again!");
    }
    router.push(`/c/${crewId}`);
  }

  const ready = picked.length >= MIN_VIBES;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <input
        className="field"
        placeholder="What do your friends call you?"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />

      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold">Pick your vibes</p>
        <span
          key={picked.length}
          className={`animate-pop rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${ready ? "bg-sun" : "bg-white"}`}
        >
          {picked.length}/{MAX_VIBES}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {VIBES.map((v, i) => {
          const on = picked.includes(v);
          return (
            <button
              type="button"
              key={v}
              onClick={() => toggle(v)}
              style={{ rotate: TILTS[i % TILTS.length] }}
              className={`btn px-4 py-2 ${on ? `${PICKED_COLORS[i % PICKED_COLORS.length]} animate-pop` : "bg-white"}`}
            >
              {on ? "✓ " : ""}
              {v}
            </button>
          );
        })}
      </div>

      <button disabled={!ready || loading} className="btn bg-sun px-4 py-4 text-xl disabled:opacity-40">
        {loading ? (
          <span className="inline-block animate-spin-slow">🌀</span>
        ) : ready ? (
          "I'm in! 🎉"
        ) : (
          `Pick ${MIN_VIBES - picked.length} more`
        )}
      </button>
      {error && <p className="animate-shake font-semibold text-red-600">{error}</p>}
    </form>
  );
}
