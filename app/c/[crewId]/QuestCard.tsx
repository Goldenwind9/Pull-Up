"use client";
// A started quest (this week's, or a Pull Up Now one), the "We pulled up" photo upload,
// your secret role, trip times and the photo bingo board.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";
import type { Quest } from "@/lib/services/quests";
import type { Proof } from "@/lib/services/proofs";
import type { QuestView } from "@/lib/services/crews";
import TripTimes from "./TripTimes";
import SecretRole from "./SecretRole";
import BingoBoard from "./BingoBoard";
import { TIMEZONE } from "@/lib/time";

/** "Open in Google Maps" (B15). Place ids open the exact listing; events fall back to a text search. */
function mapsUrl(q: Quest) {
  const params = new URLSearchParams({ api: "1", query: [q.placeName, q.address].filter(Boolean).join(", ") });
  if (q.source === "google_maps") params.set("query_place_id", q.sourceRef);
  return `https://www.google.com/maps/search/?${params}`;
}

const RESULT = {
  pass: { color: "bg-sky", title: "Quest complete! 🎉" },
  bonus: { color: "bg-sky", title: "Added to the crew's memories! 📸" },
  unsure: { color: "bg-sun", title: "The AI isn't sure 🤔 Get a crewmate to tap Approve below." },
  fail: { color: "bg-white", title: "Hmm, that doesn't look like it 😅 Try another photo." },
};

export default function QuestCard({ quest }: { quest: QuestView }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ proof: Proof; bingo: string[] } | null>(null);
  const [error, setError] = useState("");
  const [dropping, setDropping] = useState(false);
  const done = quest.status === "done";
  const now = quest.kind === "now";
  const endsAt = quest.expiresAt
    ? // Austin time on the server and in the browser alike, so the page doesn't change on load.
      new Date(quest.expiresAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TIMEZONE })
    : null;

  async function drop() {
    setDropping(true);
    const res = await post(`/api/quests/${quest.id}/drop`);
    setDropping(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  async function upload(file: File) {
    setError("");
    setResult(null);
    setUploading(true);
    const form = new FormData();
    form.append("photo", file);
    const res = await post<{ proof: Proof; bingo: string[] }>(`/api/quests/${quest.id}/proof`, form);
    setUploading(false);
    if (input.current) input.current.value = "";
    if (!res.ok) return setError(res.error);
    setResult(res.data);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-5">
      <article className={`sticker animate-bounce-in p-5 ${done ? "bg-sky" : "bg-white"}`}>
        <span className="sticker inline-block -rotate-2 bg-sun px-3 py-0.5 text-sm font-bold">
          {now ? (done ? "✅ Pulled up!" : "⚡ Pull Up Now") : done ? "✅ Done this week" : "🔥 This week's quest"}
        </span>
        {now && endsAt && !done && <span className="ml-2 text-sm font-semibold">until about {endsAt}</span>}
        <h2 className="mt-3 text-3xl font-bold leading-tight">{quest.title}</h2>
        {quest.hook && <p className="mt-2 text-lg italic">“{quest.hook}”</p>}
        <p className="mt-4 text-lg">{quest.task}</p>

        <div className="mt-5 rounded-2xl border-2 border-ink bg-cream p-4">
          <p className="text-lg font-bold">📍 {quest.placeName}</p>
          {quest.address && <p>{quest.address}</p>}
          <p className="mt-1 text-sm">
            {quest.estCost && <>💸 {quest.estCost}</>}
            {quest.timeNeededMin && <> · ⏱️ about {Math.round(quest.timeNeededMin / 6) / 10} h</>}
          </p>
          <a className="btn mt-3 inline-block bg-sky px-4 py-2" href={mapsUrl(quest)} target="_blank" rel="noopener noreferrer">
            {now ? "Walk there 🚶" : "Open in Google Maps"}
          </a>
          <TripTimes travel={quest.travel} />
        </div>

        <p className="mt-4">
          📸 <b>Proof:</b> {quest.proofHint}
        </p>
        <SecretRole quest={quest} />
        {now && !done && (
          <button onClick={drop} disabled={dropping} className="mt-4 text-sm font-semibold underline disabled:opacity-60">
            {dropping ? "Dropping…" : "Not feeling it? Drop this quest"}
          </button>
        )}
      </article>

      <div className="sticker animate-bounce-in bg-sun p-5 text-center" style={{ animationDelay: "0.15s" }}>
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
        />
        <button
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="btn w-full bg-white px-6 py-5 text-2xl disabled:opacity-80"
        >
          {uploading ? (
            <>
              <span className="inline-block animate-spin-slow">🌀</span> Checking your photo…
            </>
          ) : done ? (
            "Add another photo 📸"
          ) : (
            "We pulled up! 📸"
          )}
        </button>
        {error && <p className="mt-3 animate-shake font-semibold text-red-600">{error}</p>}
        {result && (
          <div className={`sticker mt-4 animate-pop p-4 text-left ${(result.proof.confidence === null ? RESULT.bonus : RESULT[result.proof.verdict]).color}`}>
            <p className="font-bold">{(result.proof.confidence === null ? RESULT.bonus : RESULT[result.proof.verdict]).title}</p>
            {result.proof.caption && <p className="mt-2 text-lg italic">“{result.proof.caption}”</p>}
            {result.proof.verdict !== "pass" && result.proof.reason && <p className="mt-2 text-sm">{result.proof.reason}</p>}
            {result.bingo.map((b) => (
              <p key={b} className="mt-2 font-bold">
                🎯 Bingo square: {b}
              </p>
            ))}
          </div>
        )}
      </div>

      <BingoBoard squares={quest.bingo} />
    </section>
  );
}
