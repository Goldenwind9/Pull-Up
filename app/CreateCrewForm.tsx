"use client";
// Create-crew form. Home area defaults to UT Austin; "Use my location" overrides it.
// TODO(Frontend): vibe chips for the creator, Share invite button (navigator.share).
import { useState } from "react";
import { useRouter } from "next/navigation";

const DEFAULT_HOME = { label: "UT Austin", lat: 30.2849, lng: -97.7341 };

export default function CreateCrewForm() {
  const router = useRouter();
  const [crewName, setCrewName] = useState("");
  const [yourName, setYourName] = useState("");
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
        interests: [],
      }),
    });
    if (!res.ok) {
      setLoading(false);
      return setError("Something went wrong. Try again!");
    }
    const { crewId } = await res.json();
    router.push(`/c/${crewId}`);
  }

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
      <button className="btn bg-sun px-4 py-4 text-xl" disabled={loading}>
        {loading ? (
          <span className="inline-block animate-spin-slow">🌀</span>
        ) : (
          "Let's pull up! 🚀"
        )}
      </button>
      {error && <p className="animate-shake font-semibold text-red-600">{error}</p>}
    </form>
  );
}
