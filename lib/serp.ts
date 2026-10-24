/* eslint-disable @typescript-eslint/no-explicit-any -- SerpApi responses are untyped JSON */
// SerpApi wrapper. Every response is saved in serp_cache so repeat searches
// are free and the demo can replay them offline (DEMO_MODE).
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { DEMO_MODE } from "@/lib/ai";

type Engine = "google_maps" | "google_events";

export type Place = {
  name: string;
  address?: string;
  type?: string;
  rating?: number;
  hours?: string;
  lat?: number;
  lng?: number;
  placeId: string;
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

/** Top 8 places for `query` near a lat/lng. */
export async function searchPlaces(query: string, lat: number, lng: number): Promise<Place[]> {
  const res = await cachedSearch("google_maps", {
    q: query,
    ll: `@${lat},${lng},14z`,
    type: "search",
  });
  // TODO(Data): confirm field names against a real response.
  const results = (res.local_results as Record<string, any>[] | undefined) ?? [];
  return results.slice(0, 8).map((r) => ({
    name: r.title,
    address: r.address,
    type: r.type,
    rating: r.rating,
    hours: r.hours,
    lat: r.gps_coordinates?.latitude,
    lng: r.gps_coordinates?.longitude,
    placeId: r.place_id,
  }));
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
