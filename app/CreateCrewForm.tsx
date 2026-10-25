"use client";
// Create-crew form. Home area defaults to UT Austin; "Use my location" overrides it.
// The Share invite button lives on the crew home page, right where the creator lands.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MIN_VIBES } from "@/lib/vibes";
import VibePicker from "@/app/components/VibePicker";
import FeatureToggles from "@/app/components/FeatureToggles";
import { DEFAULT_FEATURES } from "@/lib/features";

const DEFAULT_HOME = { label: "UT Austin", lat: 30.2849, lng: -97.7341 };

/** `initialTags`: vibes picked up front (the demo tags in COMPLETE_DEMO_MODE). */
export default function CreateCrewForm({ initialTags = [] }: { initialTags?: string[] }) {
  const router = useRouter();
  const [crewName, setCrewName] = useState("");
  const [yourName, setYourName] = useState("");
  const [picked, setPicked] = useState<string[]>(initialTags);
  const [features, setFeatures] = useState(DEFAULT_FEATURES);
  const [showExtras, setShowExtras] = useState(false);
  const [home, setHome] = useState(DEFAULT_HOME);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function useMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHome({ label: "Near me", lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location");
        setLocating(false);
      },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/crews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crewName,
        yourName,
        homeLabel: home.label,
        homeLat: home.lat,
        homeLng: home.lng,
        interests: picked,
        features,
      }),
    });
    if (!res.ok) {
      setLoading(false);
      return setError("Something went wrong. Try again!");
    }
    const { crewId } = await res.json();
    router.push(`/c/${crewId}`);
  }

  const ready = picked.length >= MIN_VIBES;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <input
        className="field"
        placeholder="Crew name (e.g. The Taco Bandits)"
        value={crewName}
        onChange={(e) => setCrewName(e.target.value)}
        required
      />
      <input
        className="field"
        placeholder="Your name"
        value={yourName}
        onChange={(e) => setYourName(e.target.value)}
        required
      />
      <VibePicker picked={picked} onChange={setPicked} ready={ready} />
      <div className="flex items-center justify-between gap-3 rounded-2xl border-3 border-dashed border-ink bg-cream px-4 py-3">
        <span>
          📍 <b>{home.label}</b>
        </span>
        <button
          type="button"
          onClick={useMyLocation}
          className="btn bg-sky px-3 py-1 text-sm"
          disabled={locating}
        >
          {locating ? "Finding you…" : "Use my location"}
        </button>
      </div>
      <div className="rounded-2xl border-3 border-ink bg-cream p-3">
        <button
          type="button"
          onClick={() => setShowExtras((s) => !s)}
          className="flex w-full items-center justify-between font-semibold"
        >
          <span>
            ✨ Extras: {Object.values(features).filter(Boolean).length} of {Object.keys(features).length} on
          </span>
          <span>{showExtras ? "▲" : "▼"}</span>
        </button>
        {showExtras && (
          <div className="mt-3">
            <FeatureToggles value={features} onChange={setFeatures} />
            <p className="mt-2 text-xs">You can change these later in the Crew tab.</p>
          </div>
        )}
      </div>
      <button className="btn bg-sun px-4 py-4 text-xl disabled:opacity-40" disabled={!ready || loading}>
        {loading ? (
          <span className="inline-block animate-spin-slow">🌀</span>
        ) : ready ? (
          "Let's pull up! 🚀"
        ) : (
          `Pick ${MIN_VIBES - picked.length} more vibes`
        )}
      </button>
      {error && <p className="animate-shake font-semibold text-red-600">{error}</p>}
    </form>
  );
}
