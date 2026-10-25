// "This week" = Monday to Sunday in Austin time.
export const TIMEZONE = "America/Chicago";

/** Monday of the current week in Austin, as YYYY-MM-DD. */
export function weekStart(now = new Date()): string {
  const local = new Date(now.toLocaleString("en-US", { timeZone: TIMEZONE }));
  const daysSinceMonday = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - daysSinceMonday);
  return local.toLocaleDateString("en-CA"); // en-CA formats as YYYY-MM-DD
}

export function dayOfWeek(now = new Date()): string {
  return now.toLocaleDateString("en-US", { weekday: "long", timeZone: TIMEZONE });
}

/** Proposals stay open this long before the top-voted quest wins. */
export const VOTE_WINDOW_MS = 24 * 60 * 60 * 1000;
