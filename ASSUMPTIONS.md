# Assumptions

The skeleton was built before these questions were answered, so each answer below is a guess. When the team settles one, change the answer here and update the file listed next to it.

Status key: **Assumed** = guessed, not confirmed yet. **Decided** = the team agreed.

## A. Sponsors and outside services

| # | Question | Assumption | Status | Where it lives |
|---|---|---|---|---|
| A1 | How do we get Muse Spark access? | We get a key at the Meta booth. Until then, use any OpenAI-compatible model by changing the `AI_*` variables. | Assumed | `.env`, `lib/ai.ts` |
| A2 | Responses API or Chat Completions? | Chat Completions (`ai.chat.completions.create`), because most OpenAI-compatible fallbacks support it. Switch if Meta's quickstart says otherwise. | Assumed | `scripts/smoke.ts`, agents |
| A3 | Does Muse Spark support tools, JSON output and photo input? | Yes, all three. | Assumed | `lib/agents/*` |
| A4 | Is Muse Image in the API? | Yes. Model `muse-image-1.0` on `POST /v1/images/generations`, returns `b64_json`. `IMAGE_PROVIDER=muse` uses `AI_API_KEY`. Gemini stays as a fallback. | Decided | `.env`, `lib/recap/images.ts` |
| A5 | Muse connector format and access | Unknown. The route is a stub, and the work is held until after hour 16. | Assumed | `app/api/connector/[action]` |
| A6 | SerpApi credits | Limited. Every response is cached in `serp_cache`, and each quest run is capped at 3 searches. | Assumed | `lib/serp.ts`, `lib/agents/questAgent.ts` |
| A7 | SerpApi response field names | `local_results` for maps and `events_results` for events. Check these against a real response. | Assumed | `lib/serp.ts` |
| A8 | Tiger Cloud | The free tier includes TimescaleDB, and the connection requires SSL. | Assumed | `lib/db/index.ts`, `drizzle/0001_timescale.sql` |
| A9 | Vultr | Credits cover one small VM and Object Storage. | Assumed | `deploy/` |
| A10 | Domain | **pull-up.tech** (with a dash) replaces `pullup.tech` from the design doc. | Decided | `.env.example`, `deploy/Caddyfile`, `lib/services/crews.ts` |

## B. Product decisions

| # | Question | Assumption | Status | Where it lives |
|---|---|---|---|---|
| B1 | Demo home area | UT Austin (30.2849, -97.7341), 3 km radius. "Use my location" overrides it. | Assumed | `app/CreateCrewForm.tsx`, `lib/db/schema.ts` |
| B2 | Typed neighborhood names | Not supported yet. You get the default or the phone's location. Typed names could later be looked up with SerpApi. | Assumed | `app/CreateCrewForm.tsx` |
| B3 | Vibe chips | food, coffee, music, outdoors, games, art, sports, cheap eats, nightlife, thrifting. Each person picks 4–5. The creator currently picks none (TODO). | Assumed | `lib/vibes.ts` |
| B4 | What is "this week"? | Monday to Sunday, Austin time (America/Chicago). | Assumed | `lib/time.ts` |
| B5 | When does voting close? | When more than half the crew has voted, or 24 hours after the proposals were made. | Assumed | `lib/services/quests.ts` |
| B6 | Who closes the vote? (No cron in the design) | The server checks every time the crew page loads or someone votes (`resolveVoting`). | Assumed | `lib/services/quests.ts` |
| B7 | Tie in the vote | The quest whose first vote came earliest wins. | Assumed | `lib/services/quests.ts` |
| B8 | Re-roll if the crew hates all 3 | Not yet. Maybe one per week later. | Assumed | none |
| B9 | Unfinished quest | Expires at the end of the week. | Assumed | `lib/services/quests.ts` |
| B10 | Who must upload proof? | One passing photo from anyone completes the quest for the crew. | Assumed | `lib/services/proofs.ts` |
| B11 | Who can approve an "unsure" photo? | Any crew member except the uploader. | Assumed | `lib/services/proofs.ts` |
| B12 | Who can see photos? | Crew members only, through signed links that expire after 10 minutes. The bucket is never public. | Assumed | `lib/storage.ts`, `lib/session.ts` |
| B13 | Lost cookie or new phone | That person becomes a new user. Fine for a hackathon. One user can be in several crews. | Assumed | `lib/session.ts` |
| B14 | Session length | 90 days. | Assumed | `lib/session.ts` |
| B15 | Map pin | An "Open in Google Maps" link, not an embedded map (no extra API key). | Assumed | `app/c/[crewId]/page.tsx` |
| B16 | Recap with fewer than 4 quests | Fill the empty panels with "crew hanging out" scenes. | Assumed | `lib/agents/recap.ts` |
| B17 | Comic art style | "Bold-outline cartoon, bright flat colors". | Assumed | `lib/prompts/recap.ts` |
| B18 | Streak | Number of weeks in a row with a completed quest. | Assumed | not built yet |
| B19 | Invite code format | 6 characters, with no look-alike letters or numbers. | Assumed | `lib/services/crews.ts` |
| B20 | Brand name | "PullUp" in the app, "pull-up.tech" as the address. | Assumed | `app/layout.tsx`, `app/manifest.ts` |

## C. Data model changes from the design doc

| # | Change | Why |
|---|---|---|
| C1 | `quest_votes` gains `crew_id`, `week_start`, `created_at`, plus a unique index on `(crew_id, week_start, user_id)`. | The database itself blocks a second vote in the same week. |
| C2 | `quests` gains `hook`, `why_this_crew`, `time_needed_min`, `created_at`. | Stores the agent's full output. `created_at` drives the 24h vote close. |
| C3 | `proofs` gains `reason` and `approved_by`. | Shows why the AI was unsure and who approved the photo. |
| C4 | `crew_weekly` uses `materialized_only = false` and `WITH NO DATA`. | Stats include brand-new activity, and the migration can run inside Drizzle's transaction. |
| C5 | Shared read/write functions live in `lib/services/`. | Pages, API routes and the Muse connector all reuse the same code. The doc only listed POST routes. |
| C6 | Added `APP_URL` env variable and `GET /api/health`. | Invite links need the domain, and Infra needs a simple "is it alive" check. |

## D. Tech choices made for the skeleton

- Next.js 15 (App Router, TypeScript, Tailwind 4), npm.
- `postgres` (postgres.js) as the database driver for Drizzle.
- `zod` checks AI JSON output and API input. `nanoid` makes invite codes.
- The server runs `npm start` under pm2 with Caddy in front (`deploy/`). Standalone output isn't used, so deploying stays simple.
- Every AI call starts as a stub that throws "not implemented". The AI owner fills these in.
