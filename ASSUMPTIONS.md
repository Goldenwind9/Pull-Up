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
| B16 | Recap with fewer than 4 quests | Fill the empty panels with "crew hanging out" scenes. | Assumed | `lib/agents/recap.ts` |
| B17 | Comic art style | "Bold-outline cartoon, bright flat colors". | Assumed | `lib/prompts/recap.ts` |
| B18 | Streak | Number of weeks in a row with a completed quest, counted from the `quests` table. This week counts once it's done; until then the streak runs up to last week. (Not from `crew_weekly`: its buckets start Monday UTC, our weeks start Monday Austin time.) | Assumed | `lib/services/crews.ts` |
| B21 | Can you change your vote? | No. One vote per person per week, final. A second vote returns 409. | Assumed | `lib/services/quests.ts` |
| B22 | 24 hours pass and nobody voted | The agent's first quest wins, so the crew always gets a quest. Proposals are saved 1 ms apart to keep the agent's order. | Assumed | `lib/services/quests.ts` |
| B23 | Agent returns fewer than 3 valid quests | Save what it returned (1 or 2). With only 1, it starts `active` and there is no vote. With 0, the agent throws and the route returns 500. | Assumed | `lib/services/quests.ts` |
| B24 | Two people tap Pull up at once | They share one agent run (in-memory, works because pm2 runs one process). A Postgres advisory lock per crew also guards the insert, voting and vote closing. | Assumed | `lib/services/quests.ts` |
| B25 | Members with no vibes (creators of crews made before B3 changed) | They count toward crew size and are sent to the agent as "open to anything". | Assumed | `lib/services/quests.ts` |
| B26 | What "past quests" the agent sees | The crew's last 8 quests of any status, including proposals that lost the vote, so it doesn't re-suggest them either. | Assumed | `lib/db/queries.ts` |
| B27 | Who can vote or tap Pull up | Crew members only. Pull up: 403 for non-members. Vote: 401 without a session, 403 if the quest belongs to another crew. | Assumed | `app/api/crews/[id]/generate`, `app/api/quests/[id]/vote` |
| B28 | Photos after the quest is done, failed photos | Both allowed with no limit. Extra photos still get a caption in the feed but don't change anything. After a "fail", just try another photo. | Assumed | `lib/services/proofs.ts` |
| B29 | What a recap covers | The calendar month in Austin time. A quest counts in the month its completing photo was taken. Stats are summed over `crew_weekly` weeks that overlap the month. | Assumed | `lib/recap/loadInput.ts`, `lib/time.ts` |
| B30 | Who makes the recap, and when | Any member, any time, with "Make recap". Remaking replaces this month's row. There is no automatic month-end job. | Assumed | `lib/services/recaps.ts` |
| B31 | Demo crew | "The Taco Bandits" at UT Austin, invite code `demo` (pull-up.tech/j/demo), 4 members, 3 past weeks done, this week empty so Pull up works live. `npm run seed` deletes and recreates it. Placeholder photos are used while `scripts/demo-photos/` is empty. Seeded quests have fake `source_ref`s (`seed-…`). | Assumed | `scripts/seed-demo.ts` |
| B32 | Photo size limit | 15 MB per upload. | Assumed | `lib/services/proofs.ts` |
| B33 | Testing without going to the place | `PROOF_CHECK` in `.env`: `strict` (default, real check), `lenient` (location ignored, any genuine photo loosely tied to the quest passes, never "fail"), `off` (every photo passes, AI only writes the caption). Restart the server after changing it. Set it back to `strict` before judging if the demo should show the real check. | Assumed | `lib/ai.ts`, `lib/prompts/verify.ts`, `lib/agents/verifyProof.ts` |
