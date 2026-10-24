// Quest agent: the only real agent loop. Muse Spark gets the crew profile and
// three tools, calls them (max 6 rounds), and returns exactly 3 quests.
// Owner: AI. See "AI layer > Quest agent" in the architecture doc.
import { z } from "zod";

export const QuestSchema = z.object({
  title: z.string(),
  hook: z.string(),
  task: z.string(),
  place: z.object({
    name: z.string(),
    address: z.string(),
    lat: z.number(),
    lng: z.number(),
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
 * TODO(AI):
 * 1. Build messages from lib/prompts/quest.ts + the crew profile.
 * 2. Tools: search_places -> lib/serp.searchPlaces, search_events -> lib/serp.searchEvents,
 *    get_past_quests -> last 8 quests for this crew.
 * 3. Loop until the model returns JSON or MAX_ROUNDS is hit.
 * 4. Parse with QuestAgentOutput. Drop any quest whose source_ref was not in this run's
 *    tool results, and ask the model for a replacement.
 */
export async function runQuestAgent(profile: CrewProfile): Promise<ProposedQuest[]> {
  void profile;
  throw new Error("runQuestAgent not implemented");
}
