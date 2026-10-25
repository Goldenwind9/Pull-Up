// Seeds the demo crew with 3 weeks of history so the recap and stats look full.
// Run: `npm run seed`. Owner: Data.
//
// - The crew's invite code is always "demo", so the link is pull-up.tech/j/demo.
//   Running again deletes the old demo crew and starts fresh (B31).
// - This week is left empty so "Pull up" works live on stage.
// - Photos: the files in scripts/demo-photos/ (sorted, one per week), else a
//   generated placeholder card.
// - Builds the crew's first recap at the end (a photo collage, about 15 seconds of AI).
//   `npm run seed -- --no-recap` skips it.
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { eq, sql } from "drizzle-orm";

const INVITE_CODE = "demo";
const PHOTO_DIR = path.join(__dirname, "demo-photos");

const MEMBERS = [
  { name: "Maya", interests: ["food", "music", "outdoors", "art"] },
  { name: "Jordan", interests: ["games", "sports", "cheap eats", "nightlife"] },
  { name: "Priya", interests: ["coffee", "art", "thrifting", "music"] },
  { name: "Leo", interests: ["outdoors", "food", "games", "sports"] },
];

type SeedQuest = {
  title: string;
  hook: string;
  task: string;
  placeName: string;
  address: string;
  lat: number;
  lng: number;
  proofHint: string;
  whyThisCrew: string;
  estCost: "free" | "$" | "$$";
  timeNeededMin: number;
};

// Oldest week first. The first quest of each week is the winner.
const WEEKS: { quests: SeedQuest[]; caption: string; color: string }[] = [
  {
    caption: "Four legends, one sunset, zero people who brought water.",
    color: "#ffa62b",
    quests: [
      {
        title: "Sunset Summit",
        hook: "102 steps to the best sunset in Austin. Last one up buys tacos.",
        task: "Race up Mount Bonnell and catch the sunset over Lake Austin.",
        placeName: "Mount Bonnell",
        address: "3800 Mt Bonnell Rd, Austin, TX 78731",
        lat: 30.3207,
        lng: -97.7732,
        proofHint: "The whole crew at the top with the lake behind you",
        whyThisCrew: "outdoors for Maya and Leo, free for everyone",
        estCost: "free",
        timeNeededMin: 120,
      },
      {
        title: "Arcade Gauntlet",
        hook: "Loser of skee-ball picks next week's playlist.",
        task: "Best of three across pinball, skee-ball and air hockey.",
        placeName: "Pinballz Arcade",
        address: "8940 Research Blvd, Austin, TX 78758",
        lat: 30.3739,
        lng: -97.7262,
        proofHint: "Someone holding the winning ticket strip",
        whyThisCrew: "games for Jordan and Leo",
        estCost: "$",
        timeNeededMin: 120,
      },
      {
        title: "Boba Blind Taste Test",
        hook: "Can you tell taro from ube with your eyes closed?",
        task: "Order four flavors and blind-test each other.",
        placeName: "Kung Fu Tea",
        address: "2801 Guadalupe St, Austin, TX 78705",
        lat: 30.2944,
        lng: -97.7417,
        proofHint: "A blindfolded crewmate mid-sip",
        whyThisCrew: "food and cheap eats",
        estCost: "$",
        timeNeededMin: 60,
      },
    ],
  },
  {
    caption: "Jordan dug for an hour and came back with one ABBA record. Iconic.",
    color: "#86c5ff",
    quests: [
      {
        title: "Vinyl Roulette",
        hook: "$10 each, one mystery record, and we listen to all of them tonight.",
        task: "Everyone buys one record under $10 for someone else in the crew.",
        placeName: "Waterloo Records",
        address: "600 N Lamar Blvd, Austin, TX 78703",
        lat: 30.2697,
        lng: -97.7531,
        proofHint: "Everyone holding up the record they picked",
        whyThisCrew: "music for Maya and Priya, thrifting energy for everyone",
        estCost: "$",
        timeNeededMin: 90,
      },
      {
        title: "Thrift Fit Showdown",
        hook: "$15 budget. Full outfit. The crew votes on a winner.",
        task: "Build the wildest outfit you can for $15 and walk the aisle runway.",
        placeName: "Buffalo Exchange",
        address: "2904 Guadalupe St, Austin, TX 78705",
        lat: 30.2967,
        lng: -97.7418,
        proofHint: "A group runway shot in your thrifted fits",
        whyThisCrew: "thrifting for Priya, art for Maya",
        estCost: "$",
        timeNeededMin: 90,
      },
      {
        title: "Zilker Frisbee Face-off",
        hook: "Two teams, one frisbee, eternal bragging rights.",
        task: "Play first to 7 on the Zilker great lawn.",
        placeName: "Zilker Park",
        address: "2100 Barton Springs Rd, Austin, TX 78746",
        lat: 30.2669,
        lng: -97.7729,
        proofHint: "A mid-air catch",
        whyThisCrew: "sports and outdoors",
        estCost: "free",
        timeNeededMin: 120,
      },
    ],
  },
  {
    caption: "1.5 million bats showed up. So did we, eventually.",
    color: "#2e5aa7",
    quests: [
      {
        title: "Bat Bridge Stakeout",
        hook: "1.5 million bats fly out at dusk. We'll be there with snacks.",
        task: "Grab a spot on the bridge and count bats until you give up.",
        placeName: "Ann W. Richards Congress Avenue Bridge",
        address: "Congress Ave, Austin, TX 78701",
        lat: 30.2614,
        lng: -97.7451,
        proofHint: "The crew on the bridge with bats (or at least the sky) behind you",
        whyThisCrew: "outdoors and free",
        estCost: "free",
        timeNeededMin: 90,
      },
      {
        title: "Mural Hunt",
        hook: "Recreate the postcard. Badly.",
        task: "Pose in front of the Greetings from Austin mural as letters.",
        placeName: "Greetings from Austin Mural",
        address: "1720 S 1st St, Austin, TX 78704",
        lat: 30.2484,
        lng: -97.7553,
        proofHint: "The crew spelling something with your bodies",
        whyThisCrew: "art for Maya and Priya",
        estCost: "free",
        timeNeededMin: 60,
      },
      {
        title: "Food Truck Roulette",
        hook: "Each person picks a truck for someone else. No vetoes.",
        task: "Order for a crewmate at a truck they'd never choose.",
        placeName: "The Picnic Food Truck Park",
        address: "1720 Barton Springs Rd, Austin, TX 78704",
        lat: 30.2633,
        lng: -97.7612,
        proofHint: "Everyone with their mystery meal",
        whyThisCrew: "food and cheap eats",
        estCost: "$$",
        timeNeededMin: 90,
      },
    ],
  },
];

/** `day` days after the Monday `week` (YYYY-MM-DD), at `hour`:00 UTC. */
function at(week: string, day: number, hour: number) {
  const d = new Date(`${week}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day);
  d.setUTCHours(hour);
  return d;
}

async function demoPhotos(): Promise<Buffer[]> {
  try {
    const files = (await readdir(PHOTO_DIR)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
    return Promise.all(files.map((f) => readFile(path.join(PHOTO_DIR, f))));
  } catch {
    return [];
  }
}

// Square, with the text kept small and centered: the recap collage crops photos to
// portrait or landscape tiles, which cut off wider text.
function placeholderPhoto(title: string, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200">
    <rect width="100%" height="100%" fill="${color}"/>
    <text x="50%" y="46%" font-size="150" text-anchor="middle">📸</text>
    <text x="50%" y="58%" font-size="52" font-family="sans-serif" font-weight="bold"
      fill="#f8e6a0" stroke="#2e5aa7" stroke-width="2" text-anchor="middle">${title}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function main() {
  const { db, schema } = await import("@/lib/db");
  const { putObject } = await import("@/lib/storage");
  const { weekStart } = await import("@/lib/time");
  const { inviteLink } = await import("@/lib/services/crews");

  // Start fresh: members, quests, votes and proofs cascade with the crew.
  // Users are kept so anyone who joined the old demo crew keeps a valid cookie.
  const [old] = await db.select().from(schema.crews).where(eq(schema.crews.inviteCode, INVITE_CODE));
  if (old) {
    await db.delete(schema.activity).where(eq(schema.activity.crewId, old.id));
    await db.delete(schema.recaps).where(eq(schema.recaps.crewId, old.id));
    await db.delete(schema.crews).where(eq(schema.crews.id, old.id));
    console.log(`Removed old demo crew ${old.id}`);
  }

  const now = new Date();
  const weeks = [3, 2, 1].map((n) => weekStart(new Date(now.getTime() - n * 7 * 24 * 60 * 60 * 1000)));
  const joinedAt = at(weeks[0], -2, 18);

  const users = await db
    .insert(schema.users)
    .values(MEMBERS.map((m) => ({ ...m, createdAt: joinedAt })))
    .returning();
  const [crew] = await db
    .insert(schema.crews)
    .values({
      name: "The Taco Bandits",
      inviteCode: INVITE_CODE,
      homeLabel: "UT Austin",
      homeLat: 30.2849,
      homeLng: -97.7341,
      createdBy: users[0].id,
      createdAt: joinedAt,
    })
    .returning();
  await db.insert(schema.crewMembers).values(users.map((u) => ({ crewId: crew.id, userId: u.id, joinedAt })));
  await db.insert(schema.activity).values(
    users.map((u) => ({ time: joinedAt, crewId: crew.id, userId: u.id, kind: "joined" as const })),
  );

  const photos = await demoPhotos();
  for (const [i, week] of weeks.entries()) {
    const plan = WEEKS[i];
    const proposedAt = at(week, 0, 17);
    const quests = await db
      .insert(schema.quests)
      .values(
        plan.quests.map((q, j) => ({
          ...q,
          crewId: crew.id,
          weekStart: week,
          status: j === 0 ? ("done" as const) : ("expired" as const),
          source: "google_maps" as const,
          sourceRef: `seed-${q.title.toLowerCase().replace(/\W+/g, "-")}`,
          createdAt: new Date(proposedAt.getTime() + j),
        })),
      )
      .returning();
    const winner = quests[0];

    // 3 of 4 vote for the winner, one holdout votes for the runner-up.
    const votes = users.map((u, j) => ({
      questId: j === 3 ? quests[1].id : winner.id,
      userId: u.id,
      crewId: crew.id,
      weekStart: week,
      createdAt: at(week, 0, 18 + j),
    }));
    await db.insert(schema.questVotes).values(votes);

    const uploader = users[i % users.length];
    const proofAt = at(week, 4, 23);
    const photo = photos[i]
      ? await sharp(photos[i]).rotate().resize({ width: 1600, height: 1600, fit: "inside" }).jpeg().toBuffer()
      : await placeholderPhoto(winner.title, plan.color);
    const photoKey = `proofs/${crew.id}/${winner.id}/${randomUUID()}.jpg`;
    await putObject(photoKey, photo, "image/jpeg");
    await db.insert(schema.proofs).values({
      questId: winner.id,
      userId: uploader.id,
      photoKey,
      verdict: "pass",
      confidence: 0.92,
      reason: "The crew is clearly at the spot.",
      caption: plan.caption,
      createdAt: proofAt,
    });

    await db.insert(schema.activity).values([
      ...votes.map((v) => ({ time: v.createdAt, crewId: crew.id, userId: v.userId, kind: "voted" as const, questId: v.questId })),
      { time: proofAt, crewId: crew.id, userId: uploader.id, kind: "proof_submitted" as const, questId: winner.id, meta: { verdict: "pass" } },
      { time: proofAt, crewId: crew.id, userId: uploader.id, kind: "quest_completed" as const, questId: winner.id },
    ]);
    console.log(`Week of ${week}: ${winner.title} (${photos[i] ? "demo photo" : "placeholder photo"})`);
  }

  // Backdated rows sit behind the aggregate's watermark, so refresh it now
  // instead of waiting up to 15 minutes for the policy. Stop at the start of
  // this week: materializing the unfinished week would move the watermark past
  // it, and new activity would stay hidden from crew_weekly until next week.
  await db.execute(sql`CALL refresh_continuous_aggregate('crew_weekly', NULL, time_bucket('7 days', now()))`);

  if (!process.argv.includes("--no-recap")) {
    console.log("Building the recap (about 15 seconds)…");
    const { makeRecap } = await import("@/lib/services/recaps");
    await makeRecap(crew.id, users[0].id);
    console.log("Recap ready");
  }

  console.log(`\nDemo crew: ${crew.name} (${crew.id})`);
  console.log(`Invite link: ${inviteLink(crew.inviteCode)}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
