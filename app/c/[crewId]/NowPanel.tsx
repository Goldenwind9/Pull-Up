"use client";
// ⚡ Pull Up Now: "2 hours, $20, we're near campus" -> 3 things open right now within walking
// distance. One tap on "Let's go" starts it for the whole crew. No vote, no plan.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";
import type { Quest } from "@/lib/services/quests";

const TIMES = [
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "3 hours", minutes: 180 },
];
const BUDGETS = [
  { label: "Free", dollars: 0 },
  { label: "$10", dollars: 10 },
  { label: "$20", dollars: 20 },
  { label: "$50", dollars: 50 },
];
const LOADING_LINES = [
  "Checking what's open right now…",
  "Measuring the walk…",
  "Skipping anything that closes soon…",
  "Counting your budget…",
  "Picking 3 spots…",
];

type Spot = { label: string; lat: number; lng: number };

function Chips<T>({ items, value, onPick, label }: { items: T[]; value: T; onPick: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={label(item)}
          type="button"
          onClick={() => onPick(item)}
          className={`btn px-4 py-1.5 ${item === value ? "animate-pop bg-sun" : "bg-white"}`}
        >
          {label(item)}
        </button>
      ))}
    </div>
  );
}

export default function NowPanel({
  crewId,
  home,
  options,
  canPull,
}: {
  crewId: string;
  home: Spot;
  options: Quest[];
  canPull: boolean; // false while a Pull Up Now quest is being played
}) {
  const router = useRouter();
  const [time, setTime] = useState(TIMES[1]);
  const [budget, setBudget] = useState(BUDGETS[2]);
  const [spot, setSpot] = useState<Spot>({ ...home, label: `near ${home.label}` });
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const [line, setLine] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading) return;
    const timer = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 3500);
    return () => clearInterval(timer);
  }, [loading]);

  function useMyLocation() {
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSpot({ label: "right here", lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setError("Couldn't get your location");
        setLocating(false);
      },
    );
  }

  async function pullUpNow() {
    setError("");
    setLoading(true);
    const res = await post(`/api/crews/${crewId}/now`, {
      minutes: time.minutes,
      budget: budget.dollars,
      lat: spot.lat,
      lng: spot.lng,
      label: spot.label,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setLoading(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  async function start(questId: string) {
    setError("");
    setStarting(questId);
    const res = await post(`/api/quests/${questId}/start`);
    setStarting(null);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  async function skip() {
    if (!options[0]) return;
    await post(`/api/quests/${options[0].id}/drop`);
    router.refresh();
  }

  if (options.length) {
    return (
      <section className="flex flex-col gap-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold">⚡ Open right now</h2>
          <p className="mt-1">First tap wins. No vote, no plan.</p>
        </div>
        {options.map((q, i) => (
          <article
            key={q.id}
            className="sticker animate-bounce-in bg-white p-5"
            style={{ rotate: i % 2 ? "1deg" : "-1deg", animationDelay: `${i * 0.1}s` }}
          >
            <h3 className="text-2xl font-bold leading-tight">{q.title}</h3>
            {q.hook && <p className="mt-2 italic">“{q.hook}”</p>}
            <p className="mt-3">
              📍 <b>{q.placeName}</b>
              {q.estCost ? ` · 💸 ${q.estCost}` : ""}
            </p>
            <button
              onClick={() => start(q.id)}
              disabled={starting !== null}
              className="btn mt-4 w-full bg-sun px-4 py-3 text-xl disabled:opacity-60"
            >
              {starting === q.id ? <span className="inline-block animate-spin-slow">🌀</span> : "Let's go ⚡"}
            </button>
          </article>
        ))}
        <button onClick={skip} className="text-center font-semibold underline">
          None of these? Clear them
        </button>
        {error && <p className="animate-shake text-center font-semibold text-red-600">{error}</p>}
      </section>
    );
  }

  if (!canPull) return null;

  return (
    <section className="sticker animate-bounce-in flex flex-col gap-4 bg-white p-5">
      <div>
        <p className="mb-2 font-semibold">We&apos;ve got…</p>
        <Chips items={TIMES} value={time} onPick={setTime} label={(t) => t.label} />
      </div>
      <div>
        <p className="mb-2 font-semibold">Budget each</p>
        <Chips items={BUDGETS} value={budget} onPick={setBudget} label={(b) => b.label} />
      </div>
      <div className="flex items-center justify-between gap-3 rounded-2xl border-3 border-dashed border-ink bg-cream px-4 py-3">
        <span>
          📍 We&apos;re <b>{spot.label}</b>
        </span>
        <button type="button" onClick={useMyLocation} disabled={locating} className="btn bg-sky px-3 py-1 text-sm">
          {locating ? "Finding you…" : "Use my location"}
        </button>
      </div>
      <input
        className="field"
        placeholder="Anything else? (e.g. we're starving)"
        value={note}
        maxLength={140}
        onChange={(e) => setNote(e.target.value)}
      />
      <button onClick={pullUpNow} disabled={loading} className="btn bg-sun px-6 py-4 text-2xl disabled:opacity-80">
        {loading ? <span className="inline-block animate-spin-slow">🌀</span> : "Find something now ⚡"}
      </button>
      {loading && (
        <p key={line} className="animate-pop text-center font-semibold">
          {LOADING_LINES[line]}
        </p>
      )}
      {error && <p className="animate-shake font-semibold text-red-600">{error}</p>}
    </section>
  );
}
