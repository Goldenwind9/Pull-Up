"use client";
// Recap card + "Make recap" + Share. Share sends the image file itself, so it can go
// straight to Instagram Stories or WhatsApp from the phone's share sheet.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/app/lib/post";

const LOADING_LINES = [
  "Writing the script…",
  "Drawing panel 1…",
  "Inking the outlines…",
  "Adding speech bubbles…",
  "Laying out the comic…",
];

export default function RecapView({
  crewId,
  crewName,
  imageUrl,
}: {
  crewId: string;
  crewName: string;
  imageUrl: string | null;
}) {
  const router = useRouter();
  const [making, setMaking] = useState(false);
  const [line, setLine] = useState(0);
  const [error, setError] = useState("");
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!making) return;
    const timer = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 6000);
    return () => clearInterval(timer);
  }, [making]);

  async function make() {
    setError("");
    setMaking(true);
    const res = await post(`/api/crews/${crewId}/recap`);
    setMaking(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  async function share() {
    if (!imageUrl) return;
    setSharing(true);
    try {
      const blob = await (await fetch(imageUrl)).blob();
      const file = new File([blob], `${crewName.replace(/\W+/g, "-")}-recap.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${crewName} on PullUp` });
      } else {
        // Desktop: download instead.
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError("Couldn't share. Try again!");
    }
    setSharing(false);
  }

  return (
    <section className="flex flex-col gap-5">
      {imageUrl ? (
        <div className="sticker animate-bounce-in overflow-hidden bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt={`${crewName} monthly comic`} className="w-full" />
        </div>
      ) : (
        !making && (
          <div className="sticker animate-bounce-in rotate-1 bg-sky p-6 text-center text-lg">
            No comic yet this month. Make one! 💥
          </div>
        )
      )}

      {making && (
        <div className="sticker bg-white p-6 text-center">
          <span className="inline-block animate-spin-slow text-5xl">🎨</span>
          <p key={line} className="mt-3 animate-pop text-lg font-semibold">
            {LOADING_LINES[line]}
          </p>
          <p className="mt-1 text-sm">This takes about a minute.</p>
        </div>
      )}

      {imageUrl && (
        <button onClick={share} disabled={sharing || making} className="btn bg-sun px-6 py-4 text-2xl disabled:opacity-60">
          {sharing ? "Opening…" : "Share 📤"}
        </button>
      )}
      <button onClick={make} disabled={making} className="btn bg-white px-6 py-3 text-lg disabled:opacity-60">
        {making ? "Making your comic…" : imageUrl ? "Remake this month's comic 🔄" : "Make recap 💥"}
      </button>
      {error && <p className="animate-shake text-center font-semibold text-red-600">{error}</p>}
    </section>
  );
}
