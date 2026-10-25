"use client";
// Fair meetup: where do you usually start from? Quests get picked so nobody's trip is unfair.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";
import { START_AREAS } from "@/lib/geo";

export default function StartPicker({ crewId, current }: { crewId: string; current: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(!current);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function save(label: string, lat: number, lng: number) {
    setError("");
    setSaving(label);
    const res = await post(`/api/crews/${crewId}/start-area`, { label, lat, lng });
    setSaving(null);
    if (!res.ok) return setError(res.error);
    setOpen(false);
    router.refresh();
  }

  function useMyLocation() {
    setSaving("My location");
    navigator.geolocation.getCurrentPosition(
      (pos) => save("My location", pos.coords.latitude, pos.coords.longitude),
      () => {
        setSaving(null);
        setError("Couldn't get your location");
      },
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mx-auto text-sm font-semibold underline">
        🧭 You start from <b>{current}</b> · change
      </button>
    );
  }

  return (
    <section className="sticker animate-bounce-in bg-cream p-4">
      <p className="font-bold">🧭 Where do you usually start from?</p>
      <p className="text-sm">So we pick spots that are a fair trip for everyone.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {START_AREAS.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={() => save(a.label, a.lat, a.lng)}
            disabled={saving !== null}
            className={`btn px-3 py-1 text-sm ${a.label === current ? "bg-sun" : "bg-white"}`}
          >
            {saving === a.label ? "Saving…" : a.label}
          </button>
        ))}
        <button type="button" onClick={useMyLocation} disabled={saving !== null} className="btn bg-sky px-3 py-1 text-sm">
          {saving === "My location" ? "Finding you…" : "📍 My location"}
        </button>
      </div>
      {error && <p className="mt-2 animate-shake font-semibold text-red-600">{error}</p>}
    </section>
  );
}
