// Drizzle table definitions. Matches "Data model" in the architecture doc,
// plus the changes listed in ASSUMPTIONS.md (see "Data model changes").
import {
  pgTable,
  pgMaterializedView,
  uuid,
  text,
  timestamp,
  doublePrecision,
  integer,
  real,
  jsonb,
  date,
  primaryKey,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import type { Features } from "@/lib/features";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  interests: text("interests").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crews = pgTable("crews", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  homeLabel: text("home_label").notNull(),
  homeLat: doublePrecision("home_lat").notNull(),
  homeLng: doublePrecision("home_lng").notNull(),
  radiusKm: real("radius_km").notNull().default(3),
  createdBy: uuid("created_by").references(() => users.id),
  // Added: which optional features this crew uses (lib/features.ts). Missing keys = on.
  features: jsonb("features").$type<Partial<Features>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crewMembers = pgTable(
  "crew_members",
  {
    crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    // Added (fair meetup): where this member usually starts from, e.g. "West Campus".
    startLabel: text("start_label"),
    startLat: doublePrecision("start_lat"),
    startLng: doublePrecision("start_lng"),
  },
  (t) => [primaryKey({ columns: [t.crewId, t.userId] })],
);

export type QuestStatus = "proposed" | "active" | "done" | "expired";
// "weekly": one voted quest per week. "now": Pull Up Now, open right now and walkable, no vote.
export type QuestKind = "weekly" | "now";
/** One member's trip to the quest's place (fair meetup). */
export type TravelTime = { userId: string; name: string; from: string; minutes: number; mode: string };
export type EstCost = "free" | "$" | "$$";

export const quests = pgTable(
  "quests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    status: text("status").$type<QuestStatus>().notNull().default("proposed"),
    title: text("title").notNull(),
    hook: text("hook"),
    task: text("task").notNull(),
    placeName: text("place_name").notNull(),
    address: text("address"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    source: text("source").$type<"google_maps" | "google_events">().notNull(),
    sourceRef: text("source_ref").notNull(),
    proofHint: text("proof_hint").notNull(),
    whyThisCrew: text("why_this_crew"),
    estCost: text("est_cost").$type<EstCost>(),
    timeNeededMin: integer("time_needed_min"),
    // Added: needed to close the vote 24h after proposals were made.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Added (Pull Up Now): "now" quests skip the vote and expire when the crew's time is up.
    kind: text("kind").$type<QuestKind>().notNull().default("weekly"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    // Added (fair meetup): each member's travel time to the place, from SerpApi Directions.
    travel: jsonb("travel").$type<TravelTime[]>(),
  },
  (t) => [index("quests_crew_week_idx").on(t.crewId, t.weekStart)],
);

export const questVotes = pgTable(
  "quest_votes",
  {
    questId: uuid("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    // Added: lets the database enforce one vote per person per crew per week.
    crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.questId, t.userId] }),
    uniqueIndex("one_vote_per_week").on(t.crewId, t.weekStart, t.userId),
  ],
);

export type Verdict = "pass" | "unsure" | "fail";

export const proofs = pgTable("proofs", {
  id: uuid("id").primaryKey().defaultRandom(),
  questId: uuid("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  photoKey: text("photo_key").notNull(),
  verdict: text("verdict").$type<Verdict>().notNull(),
  confidence: real("confidence"),
  reason: text("reason"),
  caption: text("caption"),
  // Added: set when a crew member taps Approve on an "unsure" photo.
  approvedBy: uuid("approved_by").references(() => users.id),
  // Added: the recap this photo went into. Null = not used yet, so the next recap picks it up.
  recapId: uuid("recap_id").references(() => recaps.id, { onDelete: "set null" }),
  // Added (photo bingo): a fun fact about what's in the photo, from Google Lens + the model.
  funFact: text("fun_fact"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Added (secret roles): each member's private role for a quest, revealed in the recap.
export const questRoles = pgTable(
  "quest_roles",
  {
    questId: uuid("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // "The Critic"
    emoji: text("emoji").notNull(),
    mission: text("mission").notNull(), // "Get everyone to rate their order out of 10."
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.questId, t.userId] })],
);

// Added (photo bingo): 5 photo prompts per quest, checked off by the photo checker.
export const bingoSquares = pgTable(
  "bingo_squares",
  {
    questId: uuid("quest_id").notNull().references(() => quests.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(), // 0-4
    prompt: text("prompt").notNull(), // "a stranger's dog"
    proofId: uuid("proof_id").references(() => proofs.id, { onDelete: "set null" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.questId, t.idx] })],
);

export const recaps = pgTable("recaps", {
  id: uuid("id").primaryKey().defaultRandom(),
  crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  script: jsonb("script"),
  imageKey: text("image_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const serpCache = pgTable("serp_cache", {
  queryHash: text("query_hash").primaryKey(),
  engine: text("engine").notNull(),
  response: jsonb("response").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityKind =
  | "joined"
  | "voted"
  | "proof_submitted"
  | "quest_completed"
  | "recap_made";

// Hypertable. Created here so Drizzle knows the columns; the hypertable and
// the crew_weekly view are set up by the custom SQL migration in drizzle/.
export const activity = pgTable("activity", {
  time: timestamp("time", { withTimezone: true }).notNull().defaultNow(),
  crewId: uuid("crew_id").notNull(),
  userId: uuid("user_id"),
  kind: text("kind").$type<ActivityKind>().notNull(),
  questId: uuid("quest_id"),
  meta: jsonb("meta").default({}),
});

// Continuous aggregate, created by SQL migration. `.existing()` tells
// drizzle-kit not to try to create it.
export const crewWeekly = pgMaterializedView("crew_weekly", {
  week: timestamp("week", { withTimezone: true }).notNull(),
  crewId: uuid("crew_id").notNull(),
  questsDone: integer("quests_done").notNull(),
  photos: integer("photos").notNull(),
  votes: integer("votes").notNull(),
}).existing();
