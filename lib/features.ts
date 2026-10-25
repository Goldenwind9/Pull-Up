// Optional crew features. The creator picks them when making the crew and can change
// them later in the Crew tab. Weekly quests, voting, photo proof and recaps are always on.

export const FEATURES = [
  {
    key: "pullUpNow",
    emoji: "⚡",
    title: "Pull Up Now",
    blurb: "No plan? Something open and walkable, right now.",
  },
  {
    key: "fairMeetup",
    emoji: "🧭",
    title: "Fair meetup",
    blurb: "Pick spots so nobody's stuck with a 40-minute trip.",
  },
  {
    key: "secretRoles",
    emoji: "🤫",
    title: "Secret roles",
    blurb: "Everyone gets a hidden mission, revealed in the recap.",
  },
  {
    key: "photoBingo",
    emoji: "🎯",
    title: "Photo bingo",
    blurb: "5 photo prompts per quest, plus fun facts about your snaps.",
  },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export type Features = Record<FeatureKey, boolean>;

export const FEATURE_KEYS = FEATURES.map((f) => f.key) as FeatureKey[];

/** All on: new crews start this way, and crews made before features were optional keep everything. */
export const DEFAULT_FEATURES: Features = { pullUpNow: true, fairMeetup: true, secretRoles: true, photoBingo: true };

/** What's on for a crew. Missing keys (older crews) count as on. */
export function featuresOf(stored: Partial<Features> | null | undefined): Features {
  return { ...DEFAULT_FEATURES, ...(stored ?? {}) };
}
