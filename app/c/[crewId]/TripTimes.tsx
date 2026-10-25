// Fair meetup: everyone's car-free trip to the place, with the longest one called out.
import type { TravelTime } from "@/lib/db/schema";

/** Nobody should be stuck with a trip longer than this. */
export const UNFAIR_TRIP_MIN = 40;

const MODE = { walking: "🚶", transit: "🚌" } as Record<string, string>;

export default function TripTimes({ travel }: { travel: TravelTime[] | null }) {
  if (!travel?.length) return null;
  const longest = travel.reduce((a, b) => (b.minutes > a.minutes ? b : a));
  const fair = longest.minutes <= UNFAIR_TRIP_MIN;
  return (
    <div className="mt-3 rounded-2xl border-2 border-ink bg-white/70 p-3 text-sm">
      <p className="font-bold">
        🧭 {fair ? `Fair meetup: everyone's there in ${longest.minutes} min or less` : `${longest.name} is stuck with ${longest.minutes} min 😬`}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {travel.map((t) => (
          <span
            key={t.userId}
            className={`rounded-full border-2 border-ink px-2 py-0.5 ${t.minutes > UNFAIR_TRIP_MIN ? "bg-sun" : "bg-cream"}`}
          >
            {MODE[t.mode] ?? "🧭"} {t.name} {t.minutes}m
          </span>
        ))}
      </div>
    </div>
  );
}
