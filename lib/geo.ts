// Distances and walking times, plus preset starting areas for fair meetups.

export type Point = { lat: number; lng: number };

/** Straight-line distance in km. */
export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Streets aren't straight lines: real walks are about 25% longer, at about 4.8 km/h.
const DETOUR = 1.25;
const WALK_KMH = 4.8;

/** Estimated walking time in minutes. Good enough to filter; Directions gives exact times. */
export function walkMinutes(a: Point, b: Point): number {
  return Math.round(((distanceKm(a, b) * DETOUR) / WALK_KMH) * 60);
}

/** Midpoint of the members' starting points: where a fair meetup search starts. */
export function centroid(points: Point[]): Point {
  return {
    lat: points.reduce((sum, p) => sum + p.lat, 0) / points.length,
    lng: points.reduce((sum, p) => sum + p.lng, 0) / points.length,
  };
}

/** Rough starting areas around UT Austin (B1). "Use my location" covers everywhere else. */
export const START_AREAS: (Point & { label: string })[] = [
  { label: "West Campus", lat: 30.288, lng: -97.747 },
  { label: "UT Tower", lat: 30.2862, lng: -97.7394 },
  { label: "North Campus", lat: 30.293, lng: -97.736 },
  { label: "Hyde Park", lat: 30.306, lng: -97.729 },
  { label: "Downtown", lat: 30.2672, lng: -97.7431 },
  { label: "East Austin", lat: 30.262, lng: -97.722 },
  { label: "Riverside", lat: 30.24, lng: -97.727 },
  { label: "South Congress", lat: 30.249, lng: -97.75 },
  { label: "Mueller", lat: 30.298, lng: -97.705 },
  { label: "Zilker", lat: 30.2669, lng: -97.7729 },
];
