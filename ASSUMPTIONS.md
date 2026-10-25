# Assumptions

The skeleton was built before these questions were answered, so each answer below is a guess. When the team settles one, change the answer here and update the file listed next to it.

Status key: **Assumed** = guessed, not confirmed yet. **Decided** = the team agreed.

## A. Sponsors and outside services

| # | Question | Assumption | Status | Where it lives |
|---|---|---|---|---|
| A1 | How do we get Muse Spark access? | We get a key at the Meta booth. Until then, use any OpenAI-compatible model by changing the `AI_*` variables. | Assumed | `.env`, `lib/ai.ts` |
| A2 | Responses API or Chat Completions? | Chat Completions (`ai.chat.completions.create`), because most OpenAI-compatible fallbacks support it. Switch if Meta's quickstart says otherwise. | Assumed | `scripts/smoke.ts`, agents |
| A3 | Does Muse Spark support tools, JSON output and photo input? | Yes, all three. | Assumed | `lib/agents/*` |
| A4 | Is Muse Image in the API? | Yes (`muse-image-1.0`), but the recap no longer draws images: since Danny's change it is a collage of the crew's real photos. `lib/recap/images.ts` and the `IMAGE_*` variables are unused, kept in case we bring drawn panels back. | Decided | `lib/recap/images.ts` |
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
| B3 | Vibe chips | food, coffee, music, outdoors, games, art, sports, cheap eats, nightlife, thrifting. Each person picks 4–5, including the creator (same picker on both forms). | Assumed | `lib/vibes.ts`, `app/components/VibePicker.tsx` |
| B4 | What is "this week"? | Monday to Sunday, Austin time (America/Chicago). | Assumed | `lib/time.ts` |
| B5 | When does voting close? | When more than half the crew has voted, or 24 hours after the proposals were made. Built. | Assumed | `lib/services/quests.ts` |
| B6 | Who closes the vote? (No cron in the design) | The server checks every time the crew page loads (`getCrewHome`) or someone votes (`resolveVoting`). Built. | Assumed | `lib/services/quests.ts`, `lib/services/crews.ts` |
| B7 | Tie in the vote | The quest whose first vote came earliest wins. Built. | Assumed | `lib/services/quests.ts` |
| B8 | Re-roll if the crew hates all 3 | Not yet. Pull up works once per week: if the week already has any quest (even expired ones), it returns 409. | Assumed | `lib/services/quests.ts` |
| B9 | Unfinished quest | Expires at the end of the week. Done lazily: `resolveVoting` marks last week's `proposed`/`active` quests `expired` the next time it runs. | Assumed | `lib/services/quests.ts` |
| B10 | Who must upload proof? | One passing photo from anyone completes the quest for the crew. | Assumed | `lib/services/proofs.ts` |
| B11 | Who can approve an "unsure" photo? | Any crew member except the uploader. | Assumed | `lib/services/proofs.ts` |
| B12 | Who can see photos? | Crew members only, through signed links that expire after 10 minutes. The bucket is never public. Photos are stored as upright JPEGs, 1600 px max. The recap card is served through `/api/crews/[id]/recap/image` (members only) instead of a signed link, so the Share button can fetch it without bucket CORS. | Assumed | `lib/storage.ts`, `lib/services/proofs.ts` |
| B13 | Lost cookie or new phone | That person becomes a new user. Fine for a hackathon. One user can be in several crews. | Assumed | `lib/session.ts` |
| B14 | Session length | 90 days. | Assumed | `lib/session.ts` |
| B15 | Map pin | An "Open in Google Maps" link, not an embedded map (no extra API key). Places open by Google place id; events fall back to a name + address search. | Assumed | `app/c/[crewId]/QuestCard.tsx` |
| B16 | Recap with many photos | Every unused accepted photo is shown, up to 9 (the collage adapts to 1 to 9). Over 9: one photo per quest first (most confident) so no quest drops out, then the remaining tiles spread across the period. More than 9 quests: their best photos, sampled evenly. Every photo is still marked used. | Decided (Danny), changed 2026-10-24: was one photo per quest | `lib/agents/recap.ts` |
| B17 | Recap look and text | Real proof photos in a rounded grid on a dark card, stats footer. The model sees the photos (512 px copies) and writes a title plus one caption per photo that together tell one short story, opening to payoff. If it can't take images it retries text-only, then falls back to the stored captions. | Decided (Danny), story captions added 2026-10-24 | `lib/recap/card.ts`, `lib/prompts/recap.ts` |
| B18 | Streak | Number of weeks in a row with a completed quest, counted from the `quests` table. This week counts once it's done; until then the streak runs up to last week. (Not from `crew_weekly`: its buckets start Monday UTC, our weeks start Monday Austin time.) | Assumed | `lib/services/crews.ts` |
| B21 | Can you change your vote? | No. One vote per person per week, final. A second vote returns 409. | Assumed | `lib/services/quests.ts` |
| B22 | 24 hours pass and nobody voted | The agent's first quest wins, so the crew always gets a quest. Proposals are saved 1 ms apart to keep the agent's order. | Assumed | `lib/services/quests.ts` |
| B23 | Agent returns fewer than 3 valid quests | Save what it returned (1 or 2). With only 1, it starts `active` and there is no vote. With 0, the agent throws and the route returns 500. | Assumed | `lib/services/quests.ts` |
| B24 | Two people tap Pull up at once | They share one agent run (in-memory, works because pm2 runs one process). A Postgres advisory lock per crew also guards the insert, voting and vote closing. | Assumed | `lib/services/quests.ts` |
| B25 | Members with no vibes (creators of crews made before B3 changed) | They count toward crew size and are sent to the agent as "open to anything". | Assumed | `lib/services/quests.ts` |
| B26 | What "past quests" the agent sees | The crew's last 8 quests of any status, including proposals that lost the vote, so it doesn't re-suggest them either. | Assumed | `lib/db/queries.ts` |
| B27 | Who can vote or tap Pull up | Crew members only. Pull up: 403 for non-members. Vote: 401 without a session, 403 if the quest belongs to another crew. | Assumed | `app/api/crews/[id]/generate`, `app/api/quests/[id]/vote` |
| B28 | Photos after the quest is done, failed photos | Only photos that could complete the quest are checked (in every `PROOF_CHECK` mode). Once the quest is done, later photos are accepted from anywhere: no check, verdict `pass`, the AI only writes a caption, and they go into the next recap. Before that, a "fail" just means try another photo. No limit on photos. | Assumed | `lib/services/proofs.ts` |
| B29 | What a recap covers | Every accepted photo (pass, or approved unsure) not used by an earlier recap, so there are no calendar months. The date label is the range of those photos. Stats: distinct quests, photo count, and `voted` activity from the start of the earliest photo's quest week to the latest photo. | Decided (Danny) | `lib/recap/loadInput.ts` |
| B30 | Who makes the recap, and when | Any member, any time, with "Make recap". Each recap claims its photos (`proofs.recap_id`), so a crew can make many and none overwrite each other. With no new photos the button answers 409 "No new photos since your last recap". The recap page shows the latest one. | Decided (Danny) | `lib/services/recaps.ts`, `lib/recap/saveRecap.ts` |
| B31 | Demo crew | "The Taco Bandits" at UT Austin, invite code `demo` (pull-up.tech/j/demo), 4 members, 3 past weeks done, this week empty so Pull up works live. `npm run seed` deletes and recreates it. Placeholder photos are used while `scripts/demo-photos/` is empty. Seeded quests have fake `source_ref`s (`seed-…`). | Assumed | `scripts/seed-demo.ts` |
| B32 | Photo size limit | 15 MB per upload. | Assumed | `lib/services/proofs.ts` |
| B33 | Testing without going to the place | `PROOF_CHECK` in `.env`: `strict` (default, real check), `lenient` (location ignored, any genuine photo loosely tied to the quest passes, never "fail"), `off` (every photo passes, AI only writes the caption). Restart the server after changing it. Set it back to `strict` before judging if the demo should show the real check. | Assumed | `lib/ai.ts`, `lib/prompts/verify.ts`, `lib/agents/verifyProof.ts` |

## C. Data model changes from the design doc

| # | Change | Why |
|---|---|---|
| C1 | `quest_votes` gains `crew_id`, `week_start`, `created_at`, plus a unique index on `(crew_id, week_start, user_id)`. | The database itself blocks a second vote in the same week. |
| C2 | `quests` gains `hook`, `why_this_crew`, `time_needed_min`, `created_at`. | Stores the agent's full output. `created_at` drives the 24h vote close. |
| C3 | `proofs` gains `reason` and `approved_by`. | Shows why the AI was unsure and who approved the photo. |
| C4 | `crew_weekly` uses `materialized_only = false` and `WITH NO DATA`. | Stats include brand-new activity, and the migration can run inside Drizzle's transaction. |
| C5 | Shared read/write functions live in `lib/services/`. | Pages, API routes and the Muse connector all reuse the same code. The doc only listed POST routes. |
| C6 | Added `APP_URL` env variable and `GET /api/health`. | Invite links need the domain, and Infra needs a simple "is it alive" check. |
| C7 | Quest `source` is derived from `source_ref`: links are `google_events`, anything else is a Google place id (`google_maps`). | The agent output has no source field, and event refs are always URLs. |
| C8 | Never refresh `crew_weekly` past the start of the current week (e.g. `refresh_continuous_aggregate(..., NULL, NULL)`). | That moves the watermark past this week, and with `materialized_only = false` new activity stays hidden until next week. Refresh up to `time_bucket('7 days', now())` instead, like the seed does. This happened once on 2026-10-24; the view was recreated to fix it. |
| C9 | `proofs` gains `recap_id` (nullable, references `recaps`, set null on delete). Migration `drizzle/0002_proof_recap_id.sql`, applied to Tiger Cloud on 2026-10-24. | Marks which photos a recap already used (Danny's recap design). `saveRecap` claims them in the same transaction that inserts the recap, so a double tap can't put one photo in two recaps. |

## D. Tech choices made for the skeleton

- Next.js 15 (App Router, TypeScript, Tailwind 4), npm.
- `postgres` (postgres.js) as the database driver for Drizzle.
- `zod` checks AI JSON output and API input. `nanoid` makes invite codes.
- The server runs `npm start` under pm2 with Caddy in front (`deploy/`). Standalone output isn't used, so deploying stays simple.
- Every AI call starts as a stub that throws "not implemented". The AI owner fills these in.
- Services throw `ServiceError(message, status)` for expected problems (not found, voting closed, already voted). Routes pass them through `errorResponse()`, which turns them into JSON errors with that status; anything else becomes a 500 (`lib/services/errors.ts`).
- API routes return 404 for IDs that aren't UUIDs, instead of letting Postgres throw a 500.
- Client components call the API through `app/lib/post.ts`, which returns `{ ok, data }` or `{ ok: false, error }` with the server's message.
- Slow AI jobs (quest generation, recap) dedupe repeat taps in memory, so a second tap waits on the running job.
- `scripts/test-voting.ts` tests voting against the real database with a throwaway crew it deletes afterwards. `--agent` also runs the real quest agent once.
