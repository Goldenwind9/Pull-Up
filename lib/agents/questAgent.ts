// Quest agent: the only real agent loop. Muse Spark gets the crew profile and
// three tools, calls them (max 6 rounds), and returns exactly 3 quests.
// Owner: AI. See "AI layer > Quest agent" in the architecture doc.
import { z } from "zod";

import OpenAI from "openai";
import { ai, MODEL } from "@/lib/ai";
import { searchPlaces, searchPlacesNearby, searchEvents } from "@/lib/serp";
import { getPastQuests } from "@/lib/db/queries";
import { openStatus } from "@/lib/hours";
import { distanceKm, walkMinutes, type Point } from "@/lib/geo";
import { NOW_SYSTEM_PROMPT, QUEST_SYSTEM_PROMPT, nowUserPrompt, questUserPrompt } from "@/lib/prompts/quest";

export const QuestSchema = z.object({
  title: z.string(),
  hook: z.string(),
  task: z.string(),
  place: z.object({
    name: z.string(),
    address: z.string(),
    lat: z.number().nullable(),
  lng: z.number().nullable(),
    source_ref: z.string(), // place_id or event link from a tool result
  }),
  proof_hint: z.string(),
  why_this_crew: z.string(),
  est_cost: z.enum(["free", "$", "$$"]),
  time_needed_min: z.number(),
});
export const QuestAgentOutput = z.object({ quests: z.array(QuestSchema).length(3) });
export type ProposedQuest = z.infer<typeof QuestSchema>;

export type CrewProfile = {
  crewId: string;
  memberInterests: string[][]; // one array of vibe tags per member
  homeLabel: string;
  homeLat: number;
  homeLng: number;
  radiusKm: number;
  dayOfWeek: string;
  /** Where searches start. Defaults to home; the fair midpoint of members' starts when known. */
  searchLat?: number;
  searchLng?: number;
  /** Members' starting areas, e.g. ["West Campus", "Downtown"] (fair meetup). */
  startAreas?: string[];
  /** Their coordinates: each search result says how far the farthest member is (fair meetup). */
  memberStarts?: Point[];
  /** Set for Pull Up Now: the crew is together at `searchLat/Lng` and wants to go right now. */
  now?: { minutes: number; budget: number; note?: string; locationLabel: string };
};

/** Pull Up Now: places must be this close on foot... */
export const NOW_MAX_WALK_MIN = 20;
/** ...and stay open at least this long after the crew gets there. */
export const NOW_MIN_OPEN_MIN = 45;

export const MAX_ROUNDS = 6;
export const MAX_SEARCHES = 3;

/**
 * The agent loop:
 * 1. Messages from lib/prompts/quest.ts + the crew profile (weekly, or Pull Up Now).
 * 2. Tools: search_places -> lib/serp (walkable + open-now only in Pull Up Now),
 *    search_events -> lib/serp.searchEvents (weekly only), get_past_quests -> last 8 quests.
 * 3. Loop until the model returns JSON or MAX_ROUNDS is hit.
 * 4. Parse with QuestAgentOutput. Drop any quest whose source_ref was not in this run's
 *    tool results, and ask the model for a replacement.
 */

type Msg = OpenAI.Chat.ChatCompletionMessageParam;

const tools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_places",
      description: "Search Google Maps for real places near the crew's home area. Location is handled for you.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_events",
      description: "Search Google Events near the crew's home area. Location is handled for you.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_past_quests",
      description: "Titles and places of this crew's last 8 quests, to avoid repeats.",
      parameters: { type: "object", properties: {} },
    },
  },
];

type KnownPlace = { name: string; address: string; lat: number | null; lng: number | null };

export async function runQuestAgent(profile: CrewProfile): Promise<ProposedQuest[]> {
  // Everything the tools returned this run. This is the allowlist for the guard.
  const known = new Map<string, KnownPlace>();
  let searches = 0;
  const center = { lat: profile.searchLat ?? profile.homeLat, lng: profile.searchLng ?? profile.homeLng };

  async function runTool(name: string, args: { query: string }): Promise<unknown> {
    if (name === "get_past_quests") return getPastQuests(profile.crewId);

    if (searches >= MAX_SEARCHES) {
      return { error: "Search limit reached. Pick from results you already have and answer now." };
    }
    searches++;

    if (name === "search_places" && profile.now) {
      // Only what's walkable and open right now. The model never sees the rest, so it can't pick them.
      const now = new Date();
      const results = await searchPlacesNearby(args.query, center.lat, center.lng);
      const usable = results.flatMap((r) => {
        if (!r.placeId || r.lat == null || r.lng == null) return [];
        const walk = walkMinutes(center, { lat: r.lat, lng: r.lng });
        if (walk > NOW_MAX_WALK_MIN) return [];
        const status = openStatus(r.operatingHours, now);
        if (status && (!status.open || (status.closesInMin != null && status.closesInMin < NOW_MIN_OPEN_MIN))) return [];
        return [{ r, walk, status }];
      });
      return usable
        .sort((a, b) => a.walk - b.walk)
        .slice(0, 8)
        .map(({ r, walk, status }) => {
          known.set(r.placeId, { name: r.name, address: r.address ?? "", lat: r.lat ?? null, lng: r.lng ?? null });
          return {
            source_ref: r.placeId,
            name: r.name,
            address: r.address,
            type: r.type,
            rating: r.rating,
            price: r.price,
            walk_min: walk,
            open: status ? (status.closesInMin == null ? "open late" : `closes in ${status.closesInMin} min`) : "hours unknown",
          };
        });
    }
    if (name === "search_places") {
      const results = await searchPlaces(args.query, center.lat, center.lng); // top 8, trimmed
      return results.filter((r) => r.placeId && r.lat != null && r.lng != null).map((r) => {
        const source_ref = r.placeId;
        known.set(source_ref, {
          name: r.name,
          address: r.address ?? "",
          lat: r.lat ?? null,
          lng: r.lng ?? null,
        });
        // Fair meetup: straight-line km to the member who's farthest away. Free to compute;
        // exact trip times come from Directions after the agent picks.
        const farthest = profile.memberStarts?.length
          ? Math.max(...profile.memberStarts.map((p) => distanceKm(p, { lat: r.lat!, lng: r.lng! })))
          : undefined;
        return {
          source_ref,
          name: r.name,
          address: r.address,
          type: r.type,
          rating: r.rating,
          hours: r.hours,
          ...(farthest != null ? { farthest_member_km: Math.round(farthest * 10) / 10 } : {}),
        };
      });
    }
    if (name === "search_events") {
      const results = await searchEvents(args.query, profile.homeLabel);
      return results.filter((r) => r.link).map((r) => {
        const source_ref = r.link;
        known.set(source_ref, {
          name: r.venue ?? r.title,
          address: r.address ?? "",
          lat: null, // SerpApi events don't include coordinates
          lng: null,
        });
        return { source_ref, title: r.title, date: r.date, venue: r.venue, address: r.address };
      });
    }
    return { error: `Unknown tool ${name}` };
  }

  const messages: Msg[] = profile.now
    ? [
        { role: "system", content: NOW_SYSTEM_PROMPT },
        { role: "user", content: nowUserPrompt(profile) },
      ]
    : [
        { role: "system", content: QUEST_SYSTEM_PROMPT },
        { role: "user", content: questUserPrompt(profile) },
      ];
  // Pull Up Now has no events tool: events come without coordinates, so "walkable" can't be checked.
  const runTools = profile.now ? tools.filter((t) => t.type === "function" && t.function.name !== "search_events") : tools;

  const valid: ProposedQuest[] = [];
  let repairs = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    const res = await ai.chat.completions.create({
      model: MODEL!,
      messages,
      tools: runTools,
      tool_choice: lastRound ? "none" : "auto", // force an answer on the final round
    });
    const msg = res.choices[0].message;
    messages.push(msg);

    // 1. Model wants tools: run them and loop
    if (msg.tool_calls?.length) {
      for (const call of msg.tool_calls) {
        if (call.type !== "function") continue;
        let result: unknown;
        try {
          result = await runTool(call.function.name, JSON.parse(call.function.arguments || "{}"));
        } catch (e) {
          result = { error: String(e) };
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
      continue;
    }

    // 2. Model answered: parse + guard
    const parsed = parseQuests(msg.content ?? "");
    if (!parsed) {
      messages.push({ role: "user", content: 'Reply with ONLY valid JSON: {"quests":[...]}. No prose, no code fences.' });
      continue;
    }

    for (const q of parsed) {
      const src = known.get(q.place.source_ref);
      if (!src) continue; // invented place: drop
      if (valid.some((v) => v.place.source_ref === q.place.source_ref)) continue; // dupes
      // Overwrite place fields with tool data so the model can't corrupt them
      valid.push({ ...q, place: { ...q.place, ...src } });
    }

    if (valid.length >= 3) return valid.slice(0, 3);

    // 3. Ask for replacements only
    if (repairs++ >= 2) break;
    const need = 3 - valid.length;
    messages.push({
      role: "user",
      content:
        `${need} quest(s) were dropped because their source_ref was not in your tool results. ` +
        `Return ${need} replacement quest(s) as {"quests":[...]} using only source_ref values ` +
        `from earlier tool results (you may search again if you have searches left). ` +
        `Do not repeat: ${valid.map((v) => v.title).join(", ")}.`,
    });
  }

  if (valid.length === 0) throw new Error("Quest agent produced no valid quests");
  return valid; // caller decides what to do with < 3 (e.g. show what you have)
}

function parseQuests(text: string): ProposedQuest[] | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const json = JSON.parse(cleaned);
    const out = z.object({ quests: z.array(QuestSchema).min(1) }).safeParse(json);
    return out.success ? out.data.quests : null;
  } catch {
    return null;
  }
}