/* eslint-disable @typescript-eslint/no-explicit-any -- SerpApi responses are untyped JSON */
// SerpApi wrapper. Every response is saved in serp_cache so repeat searches
// are free and the demo can replay them offline (DEMO_MODE).
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEMO_MODE } from "@/lib/ai";

type Engine = "google_maps" | "google_events" | "google_maps_directions";

export type Place = {
  name: string;
  address?: string;
  type?: string;
  rating?: number;
  hours?: string;
  lat?: number;
  lng?: number;
  placeId: string;
  price?: string; // "$", "$10–20"
  operatingHours?: Record<string, string>; // { saturday: "11 AM–10 PM", ... }, see lib/hours.ts
};

export type Event = {
  title: string;
  date?: string;
  venue?: string;
  address?: string;
  link: string;
};

async function cachedSearch(engine: Engine, params: Record<string, string>) {
  const queryHash = createHash("sha256")
    .update(JSON.stringify({ engine, ...params }))
    .digest("hex");

  const [hit] = await db
    .select()
    .from(schema.serpCache)
    .where(eq(schema.serpCache.queryHash, queryHash))
    .limit(1);
  if (hit) return hit.response as Record<string, unknown>;
  if (DEMO_MODE) return {};

  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine,
    ...params,
    api_key: process.env.SERPAPI_KEY ?? "",
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi ${engine} failed: ${res.status}`);
  const response = await res.json();

  await db.insert(schema.serpCache).values({ queryHash, engine, response }).onConflictDoNothing();
  return response as Record<string, unknown>;
}

/** A search that matches exactly one place returns `place_results` instead of a list. */
function mapResults(res: Record<string, unknown>): Record<string, any>[] {
  const list = res.local_results as Record<string, any>[] | undefined;
  if (list?.length) return list;
  const single = res.place_results as Record<string, any> | undefined;
  if (!single) return [];
  // The single-place shape lists hours as [{ monday: "..." }, ...] instead of one object.
  const hours = Array.isArray(single.hours) ? Object.assign({}, ...single.hours) : undefined;
  return [
    {
      ...single,
      type: Array.isArray(single.type) ? single.type[0] : single.type,
      hours: single.open_state, // the list shape's "hours" is this status line
      operating_hours: single.operating_hours ?? hours,
    },
  ];
}

function toPlace(r: Record<string, any>): Place {
  return {
    name: r.title,
    address: r.address,
    type: r.type,
    rating: r.rating,
    hours: r.hours,
    lat: r.gps_coordinates?.latitude,
    lng: r.gps_coordinates?.longitude,
    placeId: r.place_id,
    price: r.price,
    operatingHours: r.operating_hours,
  };
}

/** Top 8 places for `query` near a lat/lng. */
export async function searchPlaces(query: string, lat: number, lng: number): Promise<Place[]> {
  const res = await cachedSearch("google_maps", {
    q: query,
    ll: `@${lat},${lng},14z`,
    type: "search",
  });
  // Field names checked against a real response on 2026-10-24 (A7).
  const results = mapResults(res);
  return results.slice(0, 8).map(toPlace);
}

/** Nearby places at street level (zoom 16), for "within walking distance" searches. */
export async function searchPlacesNearby(query: string, lat: number, lng: number): Promise<Place[]> {
  const res = await cachedSearch("google_maps", { q: query, ll: `@${lat},${lng},16z`, type: "search" });
  const results = mapResults(res);
  return results.slice(0, 20).map(toPlace);
}

export type Trip = { minutes: number; mode: string };

/**
 * Fastest car-free trip (walking or transit) between two points, from Google Maps Directions.
 * One call returns every mode's time in `durations`. Null if there's no route.
 */
export async function travelTime(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<Trip | null> {
  // Rounded so nearby starts share a cache entry (~100 m).
  const fmt = (p: { lat: number; lng: number }) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
  const res = await cachedSearch("google_maps_directions", { start_coords: fmt(from), end_coords: fmt(to) });
  const durations = (res.durations as { travel_mode: string; duration: number }[] | undefined) ?? [];
  const carFree = durations.filter((d) => d.travel_mode === "Walking" || d.travel_mode === "Transit");
  if (!carFree.length) return null;
  const best = carFree.reduce((a, b) => (b.duration < a.duration ? b : a));
  return { minutes: Math.round(best.duration / 60), mode: best.travel_mode.toLowerCase() };
}

/** What Google Lens finds for a public image URL: titles of matching pages. Not cached (signed URLs are unique). */
export async function lensMatches(imageUrl: string): Promise<{ title: string; source?: string }[]> {
  if (DEMO_MODE) return [];
  const url = new URL("https://serpapi.com/search.json");
  url.search = new URLSearchParams({
    engine: "google_lens",
    type: "visual_matches", // the default type only returns a deferred AI overview token
    url: imageUrl,
    api_key: process.env.SERPAPI_KEY ?? "",
  }).toString();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpApi google_lens failed: ${res.status}`);
  const json = await res.json();
  return ((json.visual_matches as Record<string, any>[] | undefined) ?? [])
    .slice(0, 8)
    .map((m) => ({ title: String(m.title ?? ""), source: m.source }));
}

/** Top 8 events for `query` near a place name, e.g. "Austin, TX". */
export async function searchEvents(query: string, near: string): Promise<Event[]> {
  const res = await cachedSearch("google_events", { q: `${query} near ${near}` });
  const results = (res.events_results as Record<string, any>[] | undefined) ?? [];
  return results.slice(0, 8).map((r) => ({
    title: r.title,
    date: r.date?.when,
    venue: r.venue?.name,
    address: Array.isArray(r.address) ? r.address.join(", ") : r.address,
    link: r.link,
  }));
}
