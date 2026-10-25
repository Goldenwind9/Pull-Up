// COMPLETE_DEMO_MODE=true: a fully scripted demo for judging. No AI or SerpApi calls at
// all, so it works anywhere (even where the model API is blocked) and plays out the same
// every time:
//   - the create/join vibe chips come pre-picked with DEMO_TAGS
//   - "Pull up" proposes DEMO_QUESTS; the first vote always activates the Cidercade quest
//   - roles and the 5 bingo prompts are fixed
//   - the 5 photos in Demo/Photos are recognized on upload (by how they look, so phone
//     re-encoding doesn't matter) and each checks off its bingo square with a scripted
//     caption and fun fact. Any other photo still passes, with a generic caption.
// Server only (reads Demo/Photos). Edit the script freely; nothing else depends on the wording.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { ProposedQuest } from "@/lib/agents/questAgent";
import type { Role } from "@/lib/agents/questExtras";

export function completeDemo(): boolean {
  return process.env.COMPLETE_DEMO_MODE === "true";
}

/** A short pause so the loading screens show for a moment, like the real thing. */
export const demoPause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const DEMO_TAGS = ["games", "nightlife", "music", "cheap eats"];

// ---------- the weekly quest ----------

/** Google place id of Cidercade Austin: the quest that always wins the vote. */
export const DEMO_WINNER_REF = "ChIJIV3Rfou1RIYRcy-TDV8jXzw";

export const DEMO_QUESTS: ProposedQuest[] = [
  {
    title: "Arcade Gauntlet",
    hook: "Free play, cider on tap, and a whole wall of pinball. Bring your A-game.",
    task: "Everyone plays one round of pinball, one Guitar Hero song and one retro cabinet. Lowest score buys the fries.",
    place: {
      name: "Cidercade Austin",
      address: "600 E Riverside Dr, Austin, TX 78704",
      lat: 30.2524716,
      lng: -97.7410337,
      source_ref: DEMO_WINNER_REF,
    },
    proof_hint: "The crew mid-game at the arcade",
    why_this_crew: "games and nightlife for everyone, music for the Guitar Hero duet",
    est_cost: "$",
    time_needed_min: 120,
  },
  {
    title: "Vinyl Roulette",
    hook: "$10 each, one mystery record, and we listen to all of them tonight.",
    task: "Everyone buys one record under $10 for someone else in the crew.",
    place: {
      name: "Waterloo Records",
      address: "600 N Lamar Blvd, Austin, TX 78703",
      lat: 30.2697,
      lng: -97.7531,
      source_ref: "demo-waterloo-records",
    },
    proof_hint: "Everyone holding up the record they picked",
    why_this_crew: "music lovers, on a cheap-eats budget",
    est_cost: "$",
    time_needed_min: 90,
  },
  {
    title: "Mural Hunt",
    hook: "Recreate the postcard. Badly.",
    task: "Pose in front of the Greetings from Austin mural, then find two more murals on South 1st.",
    place: {
      name: "Greetings from Austin Mural",
      address: "1720 S 1st St, Austin, TX 78704",
      lat: 30.2484,
      lng: -97.7553,
      source_ref: "demo-greetings-mural",
    },
    proof_hint: "The crew spelling something with your bodies",
    why_this_crew: "free, outdoors, and very photogenic",
    est_cost: "free",
    time_needed_min: 60,
  },
];

/** Pull Up Now options near campus (only if a presenter taps Pull Up Now). */
export const DEMO_NOW_QUESTS: ProposedQuest[] = [
  {
    title: "Turtle Pond Hang",
    hook: "5-minute walk: count the turtles, rank them, name the winner.",
    task: "Find the turtle pond, give every turtle you spot a name, and vote on the cutest.",
    place: { name: "UT Turtle Pond", address: "Main Mall, Austin, TX 78712", lat: 30.2869, lng: -97.7404, source_ref: "demo-turtle-pond" },
    proof_hint: "The crew with a turtle in the background",
    why_this_crew: "free and outdoors",
    est_cost: "free",
    time_needed_min: 45,
  },
  {
    title: "Blanton Sketch-Off",
    hook: "10-minute walk: one painting, five sketches, zero art skills.",
    task: "Pick one painting together and each sketch it in 3 minutes. Vote on the best.",
    place: {
      name: "Blanton Museum of Art",
      address: "200 E Martin Luther King Jr Blvd, Austin, TX 78712",
      lat: 30.2808,
      lng: -97.7375,
      source_ref: "demo-blanton",
    },
    proof_hint: "Everyone holding up their sketch",
    why_this_crew: "art, cheap and close",
    est_cost: "$",
    time_needed_min: 90,
  },
  {
    title: "Drag Snack Crawl",
    hook: "3-minute walk: three snacks, three stops, one winner.",
    task: "Each person picks one snack spot on the Drag. Rate every snack out of 10.",
    place: { name: "The Drag (Guadalupe St)", address: "Guadalupe St, Austin, TX 78705", lat: 30.2855, lng: -97.742, source_ref: "demo-the-drag" },
    proof_hint: "All three snacks in one photo",
    why_this_crew: "cheap eats, right now",
    est_cost: "$",
    time_needed_min: 60,
  },
];

// ---------- secret roles + bingo (for the Cidercade quest) ----------

/** Dealt in the order members joined. */
export const DEMO_ROLES: Role[] = [
  { role: "The High Score Hunter", emoji: "🏆", mission: "Get your initials on one high-score board before you leave." },
  { role: "The Critic", emoji: "🧐", mission: "Get everyone to rate every game out of 10, out loud." },
  { role: "The Rockstar", emoji: "🎸", mission: "Start a Guitar Hero duet and refuse to lose it." },
  { role: "The Photographer", emoji: "📸", mission: "Snap the crew mid-game without anyone noticing." },
  { role: "The Hype Person", emoji: "📣", mission: "Cheer like it's the finals every time someone beats a level." },
  { role: "The Wildcard", emoji: "🃏", mission: "Talk the crew into one game none of you would pick." },
];

export const DEMO_BINGO = [
  "someone going for a high score",
  "a whole row of pinball machines",
  "a Guitar Hero duet",
  "a cabinet older than all of you",
  "a crew selfie mid-game",
];

// ---------- the 5 photos ----------

export type DemoPhoto = { file: string; caption: string; bingo: number; funFact: string };

/** One entry per file in Demo/Photos. `bingo` is the DEMO_BINGO square the photo checks off. */
export const DEMO_PHOTOS: DemoPhoto[] = [
  {
    file: "IMG_0579.jpg",
    caption: "Locked in. Blinking is for people without a high score.",
    bingo: 0,
    funFact: "The first coin-op video game, Computer Space, hit arcades in 1971, a year before Pong.",
  },
  {
    file: "IMG_5714.jpg",
    caption: "Pinball row: where quarters go to live their best life.",
    bingo: 1,
    funFact: "Pinball was banned in New York City from 1942 to 1976 for being a game of chance.",
  },
  {
    file: "IMG_9540.jpg",
    caption: "Guitar Hero duet: zero rehearsal, maximum shredding.",
    bingo: 2,
    funFact: "Guitar Hero launched in 2005, made by Harmonix, the studio that went on to create Rock Band.",
  },
  {
    file: "IMG_9655.jpg",
    caption: "Neon, the Simpsons, and a racing seat calling our names.",
    bingo: 3,
    funFact: "The Simpsons arcade game came out in 1991 and let four friends play at once.",
  },
  {
    file: "IMG_9545.JPG",
    caption: "Crew selfie, mid-boss fight. Priorities.",
    bingo: 4,
    funFact: "\"Selfie\" was the Oxford Dictionaries Word of the Year in 2013.",
  },
];

export const DEMO_UNKNOWN_CAPTION = "The crew pulled up, and the arcade lights approve.";
export const DEMO_RECAP_TITLE = "Cidercade Champions";

// ---------- recognizing the demo photos ----------

const PHOTO_DIR = path.join(process.cwd(), "Demo", "Photos");
// Mean difference of 16x16 grayscale thumbnails (0-255). Measured on these photos: the same
// photo after a lossy phone re-encode is under 3, different photos are over 45.
const MATCH_THRESHOLD = 12;

async function fingerprint(image: Buffer): Promise<Buffer> {
  return sharp(image).rotate().resize(16, 16, { fit: "fill" }).grayscale().raw().toBuffer();
}

let known: Promise<{ photo: DemoPhoto; print: Buffer }[]> | null = null;

/** Fingerprints of the demo photos, computed once. Missing files are skipped. */
function demoPrints() {
  known ??= (async () => {
    const files = new Set(await readdir(PHOTO_DIR).catch(() => [] as string[]));
    const found = DEMO_PHOTOS.filter((p) => files.has(p.file));
    if (found.length < DEMO_PHOTOS.length) console.warn(`[demo] only ${found.length} of ${DEMO_PHOTOS.length} demo photos found in ${PHOTO_DIR}`);
    return Promise.all(found.map(async (photo) => ({ photo, print: await fingerprint(await readFile(path.join(PHOTO_DIR, photo.file))) })));
  })();
  return known;
}

/** Which demo photo this upload is, if any. */
export async function recognizeDemoPhoto(image: Buffer): Promise<DemoPhoto | null> {
  const print = await fingerprint(image);
  let best: { photo: DemoPhoto; distance: number } | null = null;
  for (const k of await demoPrints()) {
    let sum = 0;
    for (let i = 0; i < print.length; i++) sum += Math.abs(print[i] - k.print[i]);
    const distance = sum / print.length;
    if (!best || distance < best.distance) best = { photo: k.photo, distance };
  }
  return best && best.distance <= MATCH_THRESHOLD ? best.photo : null;
}
