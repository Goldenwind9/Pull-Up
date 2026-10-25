"use client";
// The chosen quest for this week, plus the "We pulled up" photo upload.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";
import type { Quest } from "@/lib/services/quests";
import type { Proof } from "@/lib/services/proofs";

/** "Open in Google Maps" (B15). Place ids open the exact listing; events fall back to a text search. */
function mapsUrl(q: Quest) {
  const params = new URLSearchParams({ api: "1", query: [q.placeName, q.address].filter(Boolean).join(", ") });
  if (q.source === "google_maps") params.set("query_place_id", q.sourceRef);
  return `https://www.google.com/maps/search/?${params}`;
}

const RESULT = {
  pass: { color: "bg-sky", title: "Quest complete! 🎉" },
  unsure: { color: "bg-sun", title: "The AI isn't sure 🤔 Get a crewmate to tap Approve below." },
  fail: { color: "bg-white", title: "Hmm, that doesn't look like it 😅 Try another photo." },
};

export default function QuestCard({ quest }: { quest: Quest }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<Proof | null>(null);
  const [error, setError] = useState("");
  const done = quest.status === "done";

  async function upload(file: File) {
    setError("");
    setResult(null);
    setUploading(true);
    const form = new FormData();
    form.append("photo", file);
    const res = await post<{ proof: Proof }>(`/api/quests/${quest.id}/proof`, form);
    setUploading(false);
    if (input.current) input.current.value = "";
    if (!res.ok) return setError(res.error);
    setResult(res.data.proof);
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-5">
      <article className={`sticker animate-bounce-in p-5 ${done ? "bg-sky" : "bg-white"}`}>
        <span className="sticker inline-block -rotate-2 bg-sun px-3 py-0.5 text-sm font-bold">
          {done ? "✅ Done this week" : "🔥 This week's quest"}
        </span>
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
            Open in Google Maps
          </a>
        </div>

        <p className="mt-4">
          📸 <b>Proof:</b> {quest.proofHint}
        </p>
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
          <div className={`sticker mt-4 animate-pop p-4 text-left ${RESULT[result.verdict].color}`}>
            <p className="font-bold">{RESULT[result.verdict].title}</p>
            {result.caption && <p className="mt-2 text-lg italic">“{result.caption}”</p>}
            {result.verdict !== "pass" && result.reason && <p className="mt-2 text-sm">{result.reason}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
