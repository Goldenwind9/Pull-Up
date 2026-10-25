"use client";
// While a quest is on, re-fetch the page every few seconds so bingo squares, photos, fun
// facts and votes from the rest of the crew show up live. Paused when the tab is hidden.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
