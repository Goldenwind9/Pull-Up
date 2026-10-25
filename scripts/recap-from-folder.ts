// Builds a recap from real photos in a folder.
//   npx tsx scripts/recap-from-folder.ts "C:\Users\you\Pictures\quest-photos"
// File names become quest titles ("taco crawl.jpg" -> "taco crawl"). Uses the real Muse model if AI_API_KEY is set.
import "dotenv/config";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildRecap, type RecapDeps, type RecapPhoto } from "@/lib/agents/recap";

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

async function main() {
  const folder = process.argv[2];
  if (!folder) throw new Error('Usage: npx tsx scripts/recap-from-folder.ts "<folder with photos>"');
  const files = (await readdir(folder)).filter((f) => IMAGE_EXT.test(f)).sort();
  if (files.length === 0) throw new Error(`No .jpg/.png/.webp files in ${folder}`);

  const stored = new Map<string, Buffer>(); // in-memory stand-in for object storage
  const photos: RecapPhoto[] = [];
  for (const [i, file] of files.entries()) {
    const key = `local/${i}-${file}`;
    stored.set(key, await readFile(path.join(folder, file)));
    photos.push({
      proofId: `p${i + 1}`,
      questId: `q${i + 1}`,
      photoKey: key,
      questTitle: path.parse(file).name,
      placeName: "somewhere fun",
      caption: null,
      takenAt: new Date(Date.UTC(2026, 9, 1 + i * 6)).toISOString(),
      confidence: 0.9,
    });
  }

  const model = process.env.AI_API_KEY ? await import("@/lib/ai") : null;
  console.log(model ? "Using the real Muse model for the script." : "AI_API_KEY not set: using fallback captions.");

  const deps: RecapDeps = {
    loadInput: async () => ({
      crewName: "Test Crew",
      photos,
      stats: { questsDone: photos.length, photos: photos.length, votes: photos.length * 3 },
    }),
    completeJson: async (system, user) => {
      if (!model) throw new Error("no model configured");
      const res = await model.ai.chat.completions.create({
        model: model.MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.choices[0]?.message?.content ?? "";
    },
    putObject: async (key, body) => {
      stored.set(key, body);
    },
    getObject: async (key) => {
      const body = stored.get(key);
      if (!body) throw new Error(`not found: ${key}`);
      return body;
    },
  };

  const result = await buildRecap("local-test", "local-recap", deps);
  const card = stored.get(result.imageKey);
  if (!card) throw new Error("card was not produced");
  await mkdir("out", { recursive: true });
  await writeFile("out/recap-real-photos.jpg", card);
  console.log(result.script);
  console.log("Saved out/recap-real-photos.jpg");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});