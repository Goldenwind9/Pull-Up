// Runs the photo checker in each PROOF_CHECK mode on two photos taken nowhere
// near the quest's place. Calls the real model (6 calls), touches no database.
// Run: `npx tsx scripts/test-proof-modes.ts [path/to/photo.jpg]`
import "dotenv/config";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

const QUEST = {
  task: "Grab coffee and play a round of cards on the patio.",
  proofHint: "The crew with drinks and a card game on the table",
  placeName: "Epoch Coffee",
};

// A drawn coffee cup next to playing cards: on theme, obviously not at Epoch Coffee.
const onTheme = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
  <rect width="100%" height="100%" fill="#c8a27a"/>
  <ellipse cx="300" cy="330" rx="140" ry="40" fill="#fff"/>
  <rect x="190" y="200" width="220" height="140" rx="20" fill="#fff"/>
  <ellipse cx="300" cy="205" rx="110" ry="25" fill="#5b3a1e"/>
  <path d="M410 230 q60 10 0 80" stroke="#fff" stroke-width="18" fill="none"/>
  <g font-family="sans-serif" font-size="70">
    <rect x="520" y="180" width="150" height="210" rx="14" fill="#fff" stroke="#222" stroke-width="4" transform="rotate(-10 595 285)"/>
    <text x="545" y="270" fill="#c00" transform="rotate(-10 595 285)">A♥</text>
    <rect x="620" y="200" width="150" height="210" rx="14" fill="#fff" stroke="#222" stroke-width="4" transform="rotate(12 695 305)"/>
    <text x="645" y="290" fill="#111" transform="rotate(12 695 305)">K♠</text>
  </g>
</svg>`;

async function main() {
  const { verifyProof } = await import("@/lib/agents/verifyProof");
  const photos: [string, Buffer][] = [
    ["solid brown", await sharp({ create: { width: 900, height: 600, channels: 3, background: "#7a5230" } }).jpeg().toBuffer()],
    ["drawn coffee + cards", await sharp(Buffer.from(onTheme)).jpeg().toBuffer()],
  ];
  if (process.argv[2]) photos.push([process.argv[2], await readFile(process.argv[2])]);

  for (const mode of ["strict", "lenient", "off"]) {
    process.env.PROOF_CHECK = mode;
    for (const [name, photo] of photos) {
      const v = await verifyProof({ photo, ...QUEST });
      console.log(`${mode.padEnd(7)} | ${name.padEnd(20)} | ${v.verdict.padEnd(6)} | ${v.caption} (${v.reason})`);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
