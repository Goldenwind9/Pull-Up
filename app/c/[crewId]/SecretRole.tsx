"use client";
// Your secret role for this quest. Hidden until tapped, so nobody reads it over your shoulder.
import { useState } from "react";
import type { QuestView } from "@/lib/services/crews";

export default function SecretRole({ quest }: { quest: QuestView }) {
  const [shown, setShown] = useState(false);
  if (!quest.myRole) {
    return quest.rolesDealt ? (
      <p className="mt-4 text-sm">🤫 {quest.rolesDealt} secret roles dealt. They&apos;re revealed in the recap.</p>
    ) : null;
  }
  return (
    <button
      type="button"
      onClick={() => setShown((s) => !s)}
      className="mt-4 w-full rounded-2xl border-2 border-dashed border-ink bg-ink p-4 text-left text-cream"
    >
      {shown ? (
        <span className="block animate-pop">
          <span className="text-sm opacity-80">Your secret role (shh!)</span>
          <span className="mt-1 block text-xl font-bold">
            {quest.myRole.emoji} {quest.myRole.role}
          </span>
          <span className="mt-1 block">{quest.myRole.mission}</span>
          <span className="mt-2 block text-xs opacity-70">
            {quest.rolesDealt} roles dealt · revealed in the recap · tap to hide
          </span>
        </span>
      ) : (
        <span className="block text-center font-bold">🤫 Tap to see your secret role</span>
      )}
    </button>
  );
}
