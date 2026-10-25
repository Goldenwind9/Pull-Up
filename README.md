# PullUp

**One side quest a week, for your friend group, at a real place nearby.**

Group chats are great at "we should hang out" and terrible at actually doing it. PullUp fixes the planning part: an AI agent looks at what your crew is into, finds three real places and events near you, and turns each into a small quest ("Everyone plays one round of pinball, one Guitar Hero song and one retro cabinet. Lowest score buys the fries."). You vote, you go, you snap a photo to prove you pulled up, and at the end you get a recap card made for Instagram Stories.

Try it at **[pull-up.tech](https://pull-up.tech)**. Built at HackTX 2026.

## How it works

1. **Make a crew.** Pick a few vibes (games, live music, cheap eats…) and send the invite link. Friends join with one tap, no accounts or passwords.
2. **Pull up.** An agent searches Google Maps and Google Events for places that fit the whole crew, checks they're open, and proposes three quests with a hook, cost and time estimate.
3. **Vote.** The first quest to win a majority (or the top pick after 24 hours) becomes this week's quest.
4. **Go and prove it.** Upload a photo from the place. A vision model checks it matches the quest and writes a caption. When it isn't sure, any other crew member can approve it.
5. **Recap.** Every photo since your last recap becomes a 1080×1920 collage with an AI-written title and captions that tell the story, ready to share.

Weekly streaks and totals keep the crew coming back.

## Optional extras

The crew's creator can turn each of these on or off at any time:

- **⚡ Pull Up Now.** "We have 2 hours and $20, near campus": three places that are open right now, within a 20-minute walk. One tap starts it.
- **🧭 Fair meetup.** Everyone sets a starting area. Each proposal shows every member's walking or transit time, and flags anyone stuck with a 40+ minute trip.
- **🤫 Secret roles.** When a quest starts, each member gets a private mission ("Get your initials on one high-score board"). The roles are revealed on the recap.
- **🎯 Photo bingo.** Five photo prompts per quest, checked off live as photos come in, with Google Lens fun facts about what you photographed.

## Built with

| Piece | What we use |
|---|---|
| App | Next.js 15 (App Router), React 19, Tailwind CSS 4, a mobile-first installable web app |
| AI | Meta's Muse Spark through its OpenAI-compatible API: a tool-using quest agent, the photo checker, and recap writing |
| Places and events | SerpApi: Google Maps, Google Events, Maps Directions and Google Lens |
| Database | Postgres on Tiger Cloud (TimescaleDB) with Drizzle ORM. Crew activity is a hypertable, and weekly stats come from a continuous aggregate |
| Photos | S3-compatible Vultr Object Storage with signed URLs; recap cards drawn with sharp |
| Hosting | A Vultr VM running pm2 behind Caddy |

## Run it yourself

You need Node 20+, a Postgres database with the TimescaleDB extension, an S3-compatible bucket, a SerpApi key, and an OpenAI-compatible model API.

```bash
git clone https://github.com/Goldenwind9/Pull-Up.git && cd Pull-Up
npm install
cp .env.example .env    # fill in your keys (each one is explained in the file)
npm run db:migrate
npm run smoke           # checks that every key works
npm run dev             # http://localhost:3000
```

Useful settings in `.env`:

- `PROOF_CHECK`: `strict` (the photo must match the quest and place), `lenient` (for testing away from the place) or `off`.
- `DEMO_MODE=true`: replays saved SerpApi answers instead of making live calls.
- `COMPLETE_DEMO_MODE=true`: a fully scripted demo with no AI or SerpApi calls (see below).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `npm run build` / `npm start` | Develop, build, and serve in production |
| `npm run lint` | Lint |
| `npm run db:migrate` / `db:generate` / `db:studio` | Apply migrations, create one after editing `lib/db/schema.ts`, browse the data |
| `npm run seed` | Create a demo crew at `/j/demo` with three weeks of history and a recap |
| `npm run db:clean` | List test data to delete (add `-- --yes` to delete it) |
| `npm run recap:folder -- <folder>` | Make a recap card from any folder of photos, no database needed |

Tests run against the real services and clean up after themselves: `npx tsx scripts/test-voting.ts`, `scripts/test-recap.ts`, `scripts/test-proof-modes.ts` and `scripts/test-hours.ts` (offline).

### Scripted demo

With `COMPLETE_DEMO_MODE=true`, every step plays out the same way each time, from `lib/demo.ts`. Vibes come pre-picked and **Pull up** always offers the same three quests. The first vote always starts the Arcade Gauntlet at Cidercade Austin, and roles and bingo prompts are fixed. The five photos in `Demo/Photos` are recognized when uploaded, even after re-encoding, and each fills in its own bingo square. It's handy for live presentations, or anywhere the APIs aren't reachable.

## Project layout

```
app/          pages, components and API routes (app/api/)
lib/agents/   quest agent, photo checker, recap writer, roles and bingo
lib/prompts/  every model prompt, in one place
lib/services/ crews, quests and voting, proofs, recaps (the business logic)
lib/recap/    recap card rendering
lib/db/       Drizzle schema;  drizzle/  migrations
scripts/      seed, cleanup, smoke and test scripts
deploy/       pm2 and Caddy configs
```

[`ASSUMPTIONS.md`](ASSUMPTIONS.md) records the product and technical decisions we made along the way, and why.

## Deploy

On an Ubuntu server with Node 20+, pm2 and Caddy:

```bash
git clone https://github.com/Goldenwind9/Pull-Up.git && cd Pull-Up
cp .env.example .env    # fill in
npm ci && npm run build
pm2 start deploy/ecosystem.config.cjs && pm2 save
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

Then point your domain's A record at the server. Caddy handles HTTPS.
