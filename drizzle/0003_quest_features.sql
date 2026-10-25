CREATE TABLE "bingo_squares" (
	"quest_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"prompt" text NOT NULL,
	"proof_id" uuid,
	"checked_at" timestamp with time zone,
	CONSTRAINT "bingo_squares_quest_id_idx_pk" PRIMARY KEY("quest_id","idx")
);
--> statement-breakpoint
CREATE TABLE "quest_roles" (
	"quest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"emoji" text NOT NULL,
	"mission" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_roles_quest_id_user_id_pk" PRIMARY KEY("quest_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "crew_members" ADD COLUMN "start_label" text;--> statement-breakpoint
ALTER TABLE "crew_members" ADD COLUMN "start_lat" double precision;--> statement-breakpoint
ALTER TABLE "crew_members" ADD COLUMN "start_lng" double precision;--> statement-breakpoint
ALTER TABLE "proofs" ADD COLUMN "fun_fact" text;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "kind" text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quests" ADD COLUMN "travel" jsonb;--> statement-breakpoint
ALTER TABLE "bingo_squares" ADD CONSTRAINT "bingo_squares_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo_squares" ADD CONSTRAINT "bingo_squares_proof_id_proofs_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."proofs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_roles" ADD CONSTRAINT "quest_roles_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_roles" ADD CONSTRAINT "quest_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;