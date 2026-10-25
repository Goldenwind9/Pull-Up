"use client";
// On/off switches for a crew's optional features. Used when creating a crew and in the Crew tab.
import { FEATURES, type FeatureKey, type Features } from "@/lib/features";

export default function FeatureToggles({
  value,
  onChange,
  disabled = false,
}: {
  value: Features;
  onChange?: (next: Features) => void;
  disabled?: boolean;
}) {
  function toggle(key: FeatureKey) {
    onChange?.({ ...value, [key]: !value[key] });
  }
  return (
    <ul className="flex flex-col gap-2">
      {FEATURES.map((f) => {
        const on = value[f.key];
        return (
          <li key={f.key}>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggle(f.key)}
              disabled={disabled}
              className={`flex w-full items-center gap-3 rounded-2xl border-2 border-ink p-3 text-left transition-colors disabled:cursor-default ${
                on ? "bg-sun" : "bg-white opacity-70"
              }`}
            >
              <span className="text-2xl">{f.emoji}</span>
              <span className="flex-1">
                <span className="block font-bold">{f.title}</span>
                <span className="block text-sm leading-snug">{f.blurb}</span>
              </span>
              <span
                aria-hidden
                className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-ink ${on ? "bg-ink" : "bg-cream"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-ink bg-white transition-all ${
                    on ? "left-6" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
