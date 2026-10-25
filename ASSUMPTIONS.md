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
| A11 | Which Muse model, and is it reliable? | `muse-spark-1.2` (was 1.1). On 2026-10-24, 1.1 answered `404 model_not_found` at random (about 1 call in 12, so roughly a third of Pull ups failed with a 500); 1.2 and 1.3 had none and are as fast. `lib/ai.ts` retries `model_not_found` for every AI call, and the last retry uses `AI_FALLBACK_MODEL` (default 1.2). | Decided | `lib/ai.ts`, `.env` |

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
| B34 | Pull Up Now: what counts as "right now" and "walkable" | Open now by the place's weekly hours (cached "Open now" text goes stale), not closing within 45 min, and at most a 20-minute walk (straight-line distance × 1.25 at 4.8 km/h). Places with unknown hours are allowed and marked so. Places only, no events (events have no coordinates). Time 1/2/3 h and budget Free/$10/$20/$50 are chips; the crew's spot is home or "Use my location". | Assumed | `lib/agents/questAgent.ts`, `lib/hours.ts`, `lib/geo.ts` |
| B35 | Pull Up Now: picking and ending | 3 options; the first "Let's go" tap starts one for everyone (no vote) and expires the others. It ends when the chosen time is up plus 30 min grace for photos. A new Pull Up Now replaces unpicked options; one being played blocks a new one until it's done or dropped. It doesn't count as the weekly quest, but a done one counts toward stats and streak. | Assumed | `lib/services/quests.ts` |
| B36 | Fair meetup | Each member picks a starting area (10 presets around campus, or their location), saved per crew. With 2+ starts, the weekly agent searches around their midpoint and sees each place's farthest-member distance. Each proposal then gets real car-free trip times (fastest of walking or transit, SerpApi Google Maps Directions) and proposals are ordered fairest first. A trip over 40 min is flagged on the card. Pull Up Now skips this (the crew is together). | Assumed | `lib/services/quests.ts`, `app/c/[crewId]/TripTimes.tsx` |
| B37 | Secret roles | Dealt by one model call when a quest becomes active (vote closes, or "Let's go"); built-in roles if the model fails. One role per member, all different; late joiners get one on their next visit. Each member sees only their own (tap to reveal). Revealed on the recap page and fed to the recap story. | Assumed | `lib/agents/questExtras.ts`, `lib/services/questExtras.ts` |
| B38 | Photo bingo | 5 prompts, written with the roles. Every photo of the quest (any verdict, bonus photos too) is checked against the open squares in the same model call as the photo check; first photo to show a square claims it. | Assumed | `lib/agents/verifyProof.ts`, `lib/services/proofs.ts` |
| B39 | Fun facts | After each upload, in the background: Google Lens (SerpApi, on a 10-minute signed link to the photo) + the model write one fact, or nothing if the matches aren't clearly interesting. Costs 1 SerpApi search per photo. | Assumed | `lib/agents/funFact.ts` |
| B40 | Live updates | The crew page re-fetches every 15 s while a quest is active or voting is open, and only while the tab is visible. | Assumed | `app/c/[crewId]/AutoRefresh.tsx` |
| B41 | Which features are optional | Pull Up Now, fair meetup, secret roles and photo bingo (fun facts come with bingo). Weekly quests, voting, photo proof and recaps are always on. All four default to on when creating a crew ("✨ Extras" on the create form). Crews made before this keep everything on. | Assumed | `lib/features.ts`, `app/CreateCrewForm.tsx` |
| B42 | Who changes them, and what happens | Only the crew's creator, in the Crew tab (anyone, for a crew with no recorded creator). Turning one off hides it right away, including roles or bingo already dealt; the API refuses it too (Pull Up Now, start areas: 403). Turning it back on brings back what was dealt; new quests get roles/bingo when they start. | Assumed | `lib/services/crews.ts`, `app/c/[crewId]/crew/` |
| B43 | Crew screen layout | Bottom tab bar instead of one long page: 🎲 Quest (this week's quest), ⚡ Now (only if enabled, red dot while one is live), 📸 Feed, 💥 Recap, 👥 Crew (stats, members, invite, starting area, Extras). Times shown in Austin time on server and browser. | Assumed | `app/c/[crewId]/layout.tsx`, `TabBar.tsx` |

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
| C10 | `quests` gains `kind` ("weekly"/"now"), `expires_at`, `travel` (jsonb trip times). `crew_members` gains `start_label/lat/lng`. `proofs` gains `fun_fact`. New tables `quest_roles` (quest, user, role, emoji, mission) and `bingo_squares` (quest, idx, prompt, proof_id). Migration `drizzle/0003_quest_features.sql`, applied 2026-10-24. | Pull Up Now, fair meetup, secret roles, photo bingo. Only additions, so older deployed code keeps working. |
| C11 | `crews` gains `features` (jsonb, default `{}`; missing keys mean on). Migration `drizzle/0004_crew_features.sql`, applied 2026-10-25. | Optional features per crew (B41). |

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
