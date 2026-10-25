// Secret roles + photo bingo for one quest: a single model call, with a built-in fallback
// so a quest always starts with both. Owner: AI.
import { z } from "zod";
import { EXTRAS_SYSTEM_PROMPT, extrasUserPrompt } from "@/lib/prompts/extras";
import { completeDemo, DEMO_BINGO, DEMO_ROLES, DEMO_WINNER_REF } from "@/lib/demo";

export type Role = { role: string; emoji: string; mission: string };
export type QuestExtras = { roles: Role[]; bingo: string[] };

export const BINGO_SIZE = 5;
const TIMEOUT_MS = 30_000;

const schema = (memberCount: number, wantBingo: boolean) =>
  z.object({
    roles: z
      .array(
        z.object({
          role: z.string().trim().min(1).max(40),
          emoji: z.string().trim().min(1).max(16),
          mission: z.string().trim().min(1).max(200),
        }),
      )
      .length(memberCount),
    bingo: wantBingo ? z.array(z.string().trim().min(1).max(80)).length(BINGO_SIZE) : z.array(z.string()),
  });

// Used when the model fails. Generic enough for any place.
const FALLBACK_ROLES: Role[] = [
  { role: "The Critic", emoji: "🧐", mission: "Get everyone to rate something here out of 10." },
  { role: "The Hype Person", emoji: "📣", mission: "Start a slow clap for someone at least once." },
  { role: "The Photographer", emoji: "📸", mission: "Get a dramatic photo of the crew without saying why." },
  { role: "The Historian", emoji: "📜", mission: "Learn one fact about this place and drop it casually." },
  { role: "The Wildcard", emoji: "🃏", mission: "Convince the crew to try one thing none of you planned." },
  { role: "The Navigator", emoji: "🧭", mission: "Secretly pick the route and make everyone follow you." },
  { role: "The Diplomat", emoji: "🕊️", mission: "Settle one tiny debate with a rock-paper-scissors." },
  { role: "The Collector", emoji: "🧺", mission: "Leave with a free souvenir: a napkin, a flyer, a sticker." },
];
const FALLBACK_BINGO = [
  "something older than all of you",
  "a stranger's dog",
  "the whole crew mid-laugh",
  "a sign with a typo or pun",
  "something bright purple",
];

/** `count` distinct roles from `all`, skipping taken ones, in order (or shuffled). */
function dealRoles(all: Role[], count: number, takenRoles: string[], shuffle: boolean): Role[] {
  const free = all.filter((r) => !takenRoles.includes(r.role));
  const pool = [...(free.length ? free : all)];
  if (shuffle) pool.sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => {
    const base = pool[i % pool.length];
    const round = Math.floor(i / pool.length);
    // A crew bigger than the pool: number the repeats so roles stay distinct.
    return round ? { ...base, role: `${base.role} #${round + 1}` } : base;
  });
}

function fallback(memberCount: number, takenRoles: string[], wantBingo: boolean): QuestExtras {
  return { roles: dealRoles(FALLBACK_ROLES, memberCount, takenRoles, true), bingo: wantBingo ? FALLBACK_BINGO : [] };
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model reply");
  return JSON.parse(raw.slice(start, end + 1));
}

/** Roles for `members` (in order) and, if `wantBingo`, 5 bingo prompts. Never throws. */
export async function writeQuestExtras(input: {
  quest: { title: string; task: string; placeName: string; sourceRef?: string };
  members: { name: string; interests: string[] }[];
  takenRoles: string[];
  wantBingo: boolean;
}): Promise<QuestExtras> {
  if (input.members.length === 0 && !input.wantBingo) return { roles: [], bingo: [] };
  if (completeDemo()) {
    // Scripted demo: the Cidercade quest gets the arcade roles and bingo, anything else the built-in set.
    if (input.quest.sourceRef !== DEMO_WINNER_REF) return fallback(input.members.length, input.takenRoles, input.wantBingo);
    // In join order, not shuffled, so the presenter knows who gets which role.
    return {
      roles: dealRoles(DEMO_ROLES, input.members.length, input.takenRoles, false),
      bingo: input.wantBingo ? DEMO_BINGO : [],
    };
  }
  try {
    // Lazy import: lib/ai throws at import time without AI_API_KEY.
    const { ai, MODEL } = await import("@/lib/ai");
    const res = await ai.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: "system", content: EXTRAS_SYSTEM_PROMPT },
          { role: "user", content: extrasUserPrompt(input) },
        ],
      },
      { timeout: TIMEOUT_MS },
    );
    const parsed = schema(input.members.length, input.wantBingo).parse(extractJson(res.choices[0]?.message?.content ?? ""));
    const names = parsed.roles.map((r) => r.role.toLowerCase());
    if (new Set(names).size !== names.length) throw new Error("duplicate roles");
    return parsed;
  } catch (err) {
    console.warn("[extras] model failed, using built-in roles/bingo:", err instanceof Error ? err.message : err);
    return fallback(input.members.length, input.takenRoles, input.wantBingo);
  }
}
