// Quest agent: the only real agent loop. Muse Spark gets the crew profile and
// three tools, calls them (max 6 rounds), and returns exactly 3 quests.
// Owner: AI. See "AI layer > Quest agent" in the architecture doc.
import { z } from "zod";

import OpenAI from "openai";
import { ai, MODEL } from "@/lib/ai";
import { searchPlaces, searchEvents } from "@/lib/serp";
import { getPastQuests } from "@/lib/db/queries";
import { QUEST_SYSTEM_PROMPT, questUserPrompt } from "@/lib/prompts/quest";

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
};

export const MAX_ROUNDS = 6;
export const MAX_SEARCHES = 3;

/**
 * TODO Implement the quest agent loop:
 * 1. Build messages from lib/prompts/quest.ts + the crew profile.
 * 2. Tools: search_places -> lib/serp.searchPlaces, search_events -> lib/serp.searchEvents,
 *    get_past_quests -> last 8 quests for this crew.
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

  async function runTool(name: string, args: { query: string }): Promise<unknown> {
    if (name === "get_past_quests") return getPastQuests(profile.crewId);

    if (searches >= MAX_SEARCHES) {
      return { error: "Search limit reached. Pick from results you already have and answer now." };
    }
    searches++;

    if (name === "search_places") {
      const results = await searchPlaces(args.query, profile.homeLat, profile.homeLng); // top 8, trimmed
      return results.filter((r) => r.placeId && r.lat != null && r.lng != null).map((r) => {
        const source_ref = r.placeId;
        known.set(source_ref, {
          name: r.name,
          address: r.address ?? "",
          lat: r.lat ?? null,
          lng: r.lng ?? null,
        });
      return { source_ref, name: r.name, address: r.address, type: r.type, rating: r.rating, hours: r.hours };
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

  const messages: Msg[] = [
    { role: "system", content: QUEST_SYSTEM_PROMPT },
    { role: "user", content: questUserPrompt(profile) },
  ];

  const valid: ProposedQuest[] = [];
  let repairs = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    const res = await ai.chat.completions.create({
      model: MODEL!,
      messages,
      tools,
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