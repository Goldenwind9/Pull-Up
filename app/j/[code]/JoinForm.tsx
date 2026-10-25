"use client";
// Name + vibe chips.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_VIBES } from "@/lib/vibes";
import VibePicker from "@/app/components/VibePicker";

export default function JoinForm({ crewId }: { crewId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

      <VibePicker picked={picked} onChange={setPicked} ready={ready} />

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
