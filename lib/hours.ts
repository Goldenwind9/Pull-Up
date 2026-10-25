// "Is it open right now?" from Google Maps weekly hours, e.g.
// { saturday: "11 AM–2:30 PM, 5–10 PM", sunday: "Closed", friday: "6 PM–2 AM" }.
// Cached search results keep a stale "Open now" text, but weekly hours stay true.
import { TIMEZONE } from "@/lib/time";

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type OpenStatus = { open: boolean; closesInMin: number | null };

/** Minutes after midnight for "7:30", with an optional "AM"/"PM". */
function toMinutes(time: string, meridiem: string | undefined): number {
  const [h, m = "0"] = time.split(":");
  let hours = Number(h) % 12;
  if (meridiem === "PM") hours += 12;
  return hours * 60 + Number(m);
}

/** One day's text -> [start, end] minute ranges. `end` can pass 1440 (open past midnight). */
export function parseDay(text: string): [number, number][] | null {
  const clean = text.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (!clean) return null;
  if (clean.includes("CLOSED")) return [];
  if (clean.includes("24 HOURS")) return [[0, 1440]];

  const ranges: [number, number][] = [];
  for (const part of clean.split(",")) {
    const m = part.trim().match(/^(\d{1,2}(?::\d{2})?)\s*(AM|PM)?\s*[–-]\s*(\d{1,2}(?::\d{2})?)\s*(AM|PM)?$/);
    if (!m) return null; // unknown format: don't guess
    const [, startTime, startMer, endTime, endMer] = m;
    const end = toMinutes(endTime, endMer);
    // "5–9 PM" means 5 PM; but "11–2 PM" means 11 AM (taking PM would start after it ends).
    let start = toMinutes(startTime, startMer ?? endMer);
    if (!startMer && start > end) start = toMinutes(startTime, "AM");
    ranges.push([start, end <= start ? end + 1440 : end]); // ends after midnight
  }
  return ranges;
}

/** Weekday name and minutes after midnight, in Austin time. */
function localTime(at: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: DAYS.indexOf(get("weekday").toLowerCase()), minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/** Open or closed at `at`, and minutes until it closes. Null when the hours are missing or unreadable. */
export function openStatus(hours: Record<string, string> | undefined, at = new Date()): OpenStatus | null {
  if (!hours) return null;
  const { day, minutes } = localTime(at);
  const today = parseDay(hours[DAYS[day]] ?? "");
  const yesterday = parseDay(hours[DAYS[(day + 6) % 7]] ?? "");
  if (!today) return null;

  // Today's ranges, plus last night's ranges that run past midnight (e.g. a bar open until 2 AM).
  const candidates = [...today, ...(yesterday ?? []).filter(([, end]) => end > 1440).map(([s, e]) => [s - 1440, e - 1440])];
  for (const [start, end] of candidates) {
    if (minutes >= start && minutes < end) return { open: true, closesInMin: end - start >= 1440 ? null : end - minutes };
  }
  return { open: false, closesInMin: null };
}
