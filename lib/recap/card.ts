// Renders the final 1080x1920 recap card. Pure image work: no network, no database.
import sharp from "sharp";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

const MARGIN = 40;
const GAP = 20;
const HEADER_H = 270;
const PANEL_W = (CARD_WIDTH - 2 * MARGIN - GAP) / 2; // 490
const PANEL_H = 690;
const FOOTER_Y = HEADER_H + 2 * PANEL_H + GAP; // 1670
const RADIUS = 28;

const BG = "#15131f";
const ACCENT = "#ffd23f";
// Needs a real font on the machine that runs this (see notes below the code).
const FONT = "DejaVu Sans, Helvetica, Arial, sans-serif";
const PLACEHOLDER_COLORS = ["#ff6b6b", "#4ecdc4", "#a78bfa", "#fbbf24"];
// Average glyph width as a fraction of font size for a bold sans font. Used to estimate wrapping.
const AVG_CHAR_EM = 0.58;

export type CardPanel = { image: Buffer | null; dialogue: string };
export type CardContent = {
  title: string;
  crewName: string;
  periodLabel: string;
  stats: { questsDone: number; photos: number; votes: number };
  panels: CardPanel[]; // exactly 4
};

// ---------- text helpers ----------

function sanitize(text: string): string {
  return (
    text
      // Emoji and other astral characters: server fonts often lack them and draw boxes.
      .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "")
      .replace(/[\u2600-\u27BF]/g, "")
       
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (let word of text.split(" ").filter(Boolean)) {
    while (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= maxChars) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function clampLines(lines: string[], maxLines: number, maxChars: number): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1];
  kept[maxLines - 1] = `${last.length >= maxChars ? last.slice(0, maxChars - 1) : last}…`;
  return kept;
}

/** Largest font size (from `sizes`, descending) whose wrapped text fits in `maxLines`; truncates at the smallest. */
function fitText(text: string, maxWidth: number, maxLines: number, sizes: number[]) {
  for (const size of sizes) {
    const lines = wrapLines(text, Math.floor(maxWidth / (size * AVG_CHAR_EM)));
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  const maxChars = Math.floor(maxWidth / (size * AVG_CHAR_EM));
  return { size, lines: clampLines(wrapLines(text, maxChars), maxLines, maxChars) };
}

// ---------- panels ----------

const ROUND_MASK = Buffer.from(
  `<svg width="${PANEL_W}" height="${PANEL_H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="${PANEL_W}" height="${PANEL_H}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
);

function framePanel(source: Buffer): Promise<Buffer> {
  return sharp(source)
    .resize(PANEL_W, PANEL_H, { fit: "cover", position: sharp.strategy.attention })
    .ensureAlpha()
    .composite([{ input: ROUND_MASK, blend: "dest-in" }])
    .png()
    .toBuffer();
}

function placeholderPanel(index: number): Promise<Buffer> {
  const color = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
  const svg =
    `<svg width="${PANEL_W}" height="${PANEL_H}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="100%" height="100%" fill="${color}"/>` +
    `<circle cx="${PANEL_W * 0.7}" cy="${PANEL_H * 0.3}" r="140" fill="#fff" fill-opacity="0.25"/>` +
    `<circle cx="${PANEL_W * 0.25}" cy="${PANEL_H * 0.55}" r="90" fill="#000" fill-opacity="0.12"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function preparePanel(image: Buffer | null, index: number): Promise<Buffer> {
  if (image) {
    try {
      return await framePanel(image);
    } catch (error) {
      console.warn(`[recap] panel ${index + 1} image undecodable, using placeholder:`, error);
    }
  }
  return framePanel(await placeholderPanel(index));
}

// ---------- overlay (all text, borders, caption boxes in one SVG) ----------

const panelOrigin = (i: number) => ({
  x: MARGIN + (i % 2) * (PANEL_W + GAP),
  y: HEADER_H + Math.floor(i / 2) * (PANEL_H + GAP),
});

function buildOverlay(content: CardContent): string {
  const out: string[] = [];
  const centerX = CARD_WIDTH / 2;
  const text = (x: number, y: number, size: number, fill: string, body: string, extra = "") =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle" ${extra}>${escapeXml(body)}</text>`;

  // Header
  out.push(text(centerX, 84, 34, ACCENT, sanitize(content.crewName).toUpperCase().slice(0, 40), 'letter-spacing="4"'));
  const title = fitText(sanitize(content.title), CARD_WIDTH - 2 * MARGIN, 2, [84, 72, 60]);
  title.lines.forEach((line, i) => {
    out.push(text(centerX, 104 + title.size + i * title.size * 1.1, title.size, "#fff", line));
  });

  // Panels: border + dialogue box
  content.panels.forEach((panel, i) => {
    const { x, y } = panelOrigin(i);
    out.push(
      `<rect x="${x}" y="${y}" width="${PANEL_W}" height="${PANEL_H}" rx="${RADIUS}" ry="${RADIUS}" fill="none" stroke="#fff" stroke-width="6"/>`,
    );
    const size = 30;
    const lineH = 38;
    const maxChars = Math.floor((PANEL_W - 32 - 40) / (size * AVG_CHAR_EM));
    const lines = clampLines(wrapLines(sanitize(panel.dialogue), maxChars), 4, maxChars);
    if (lines.length === 0) return;
    const boxH = lines.length * lineH + 32;
    const boxY = y + PANEL_H - 16 - boxH;
    out.push(
      `<rect x="${x + 16}" y="${boxY}" width="${PANEL_W - 32}" height="${boxH}" rx="20" ry="20" fill="#000" fill-opacity="0.72"/>`,
    );
    lines.forEach((line, j) => {
      out.push(text(x + PANEL_W / 2, boxY + 16 + 28 + j * lineH, size, "#fff", line));
    });
  });

  // Footer: three stats + period
  const columns: [number, string, string][] = [
    [CARD_WIDTH / 6, String(content.stats.questsDone), "QUESTS DONE"],
    [CARD_WIDTH / 2, String(content.stats.photos), "PHOTOS"],
    [(CARD_WIDTH * 5) / 6, String(content.stats.votes), "VOTES"],
  ];
  for (const [cx, value, label] of columns) {
    out.push(text(cx, FOOTER_Y + 105, 96, ACCENT, value));
    out.push(text(cx, FOOTER_Y + 150, 28, "#fff", label, 'fill-opacity="0.7" letter-spacing="3"'));
  }
  out.push(text(centerX, FOOTER_Y + 218, 30, "#fff", `${sanitize(content.periodLabel)}  ·  pull-up.tech`, 'fill-opacity="0.8"'));

  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg">${out.join("")}</svg>`;
}

// ---------- public API ----------

export async function renderRecapCard(content: CardContent): Promise<Buffer> {
  if (content.panels.length !== 4) {
    throw new Error(`Recap card needs exactly 4 panels, got ${content.panels.length}`);
  }
  const framed = await Promise.all(content.panels.map((p, i) => preparePanel(p.image, i)));

  // Panels first, then one SVG on top holding all text, borders and dialogue boxes.
  const layers = [
    ...framed.map((input, i) => {
      const { x, y } = panelOrigin(i);
      return { input, left: x, top: y };
    }),
    { input: Buffer.from(buildOverlay(content)), left: 0, top: 0 },
  ];

  return sharp({ create: { width: CARD_WIDTH, height: CARD_HEIGHT, channels: 4, background: BG } })
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}