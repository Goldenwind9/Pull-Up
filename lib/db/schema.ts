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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const crewMembers = pgTable(
  "crew_members",
  {
    crewId: uuid("crew_id").notNull().references(() => crews.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.crewId, t.userId] })],
);

export type QuestStatus = "proposed" | "active" | "done" | "expired";
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
