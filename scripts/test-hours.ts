// Checks the opening-hours parser used by Pull Up Now. No network.
// Run: npx tsx scripts/test-hours.ts
import assert from "node:assert/strict";
import { openStatus, parseDay } from "@/lib/hours";

// A Saturday in Austin (CDT, UTC-5): 2026-10-24.
const at = (hhmm: string, day = "24") => new Date(`2026-10-${day}T${hhmm}:00-05:00`);

assert.deepEqual(parseDay("7:30 AM–2 PM"), [[450, 840]]);
assert.deepEqual(parseDay("Closed"), []);
assert.deepEqual(parseDay("Open 24 hours"), [[0, 1440]]);
assert.deepEqual(parseDay("11 AM–2:30 PM, 5–10 PM"), [[660, 870], [1020, 1320]]);
assert.deepEqual(parseDay("11–2 PM"), [[660, 840]], "11–2 PM starts in the morning");
assert.deepEqual(parseDay("6 PM–2 AM"), [[1080, 1560]], "past midnight");
assert.deepEqual(parseDay("7:30 AM – 2 PM".replace(" ", " ")), [[450, 840]], "Google's narrow spaces");
assert.equal(parseDay("Hours might differ"), null);

const hours = {
  friday: "6 PM–2 AM",
  saturday: "11 AM–2:30 PM, 5–10 PM",
  sunday: "Closed",
};
assert.deepEqual(openStatus(hours, at("12:00")), { open: true, closesInMin: 150 });
assert.deepEqual(openStatus(hours, at("15:00")), { open: false, closesInMin: null }, "between lunch and dinner");
assert.deepEqual(openStatus(hours, at("21:30")), { open: true, closesInMin: 30 });
assert.deepEqual(openStatus(hours, at("01:00")), { open: true, closesInMin: 60 }, "Friday night still going");
assert.deepEqual(openStatus(hours, at("12:00", "25")), { open: false, closesInMin: null }, "Sunday closed");
assert.equal(openStatus(undefined, at("12:00")), null);
assert.deepEqual(openStatus({ saturday: "Open 24 hours" }, at("23:00")), { open: true, closesInMin: null }, "never closes");
console.log("All hours checks passed.");
