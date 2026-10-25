"use client";
// Vibe chips. Chips pop and change color when picked. Used by the join and create forms.
import { VIBES, MAX_VIBES } from "@/lib/vibes";

const PICKED_COLORS = ["bg-sun", "bg-sky", "bg-ink text-cream"];
const TILTS = ["-3deg", "2deg", "-1deg", "3deg", "-2deg"];

export default function VibePicker({
  picked,
  onChange,
  ready,
}: {
  picked: string[];
  onChange: (picked: string[]) => void;
  ready: boolean;
}) {
  function toggle(vibe: string) {
    onChange(
      picked.includes(vibe)
        ? picked.filter((v) => v !== vibe)
        : picked.length < MAX_VIBES
          ? [...picked, vibe]
          : picked,
    );
  }

  return (
    <>
      <div className="flex items-baseline justify-between">
        <p className="text-lg font-semibold">Pick your vibes</p>
        <span
          key={picked.length}
          className={`animate-pop rounded-full border-2 border-ink px-3 py-0.5 text-sm font-bold ${ready ? "bg-sun" : "bg-white"}`}
        >
          {picked.length}/{MAX_VIBES}
        </span>
      </div>

      <div className="flex flex-wrap gap-3">
        {VIBES.map((v, i) => {
          const on = picked.includes(v);
          return (
            <button
              type="button"
              key={v}
              onClick={() => toggle(v)}
              style={{ rotate: TILTS[i % TILTS.length] }}
              className={`btn px-4 py-2 ${on ? `${PICKED_COLORS[i % PICKED_COLORS.length]} animate-pop` : "bg-white"}`}
            >
              {on ? "✓ " : ""}
              {v}
            </button>
          );
        })}
      </div>
    </>
  );
}
