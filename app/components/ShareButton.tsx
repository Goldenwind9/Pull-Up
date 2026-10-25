"use client";
// Opens the phone's share sheet; on desktop, copies the link instead.
import { useState } from "react";

export default function ShareButton({
  url,
  text,
  label = "Share invite 🔗",
  className = "bg-sky px-4 py-2",
}: {
  url: string;
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "PullUp", text, url });
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return; // closed the sheet
      }
    }
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button type="button" onClick={share} className={`btn ${className}`}>
      {copied ? "Link copied! ✓" : label}
    </button>
  );
}
