// Renders the final 1080x1920 recap card: a collage of the crew's real photos. Pure image work.
import sharp from "sharp";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;
export const MAX_TILES = 9;

const MARGIN = 40;
const GAP = 20;
const HEADER_H = 270;
const FOOTER_Y = 1670;
const GRID_W = CARD_WIDTH - 2 * MARGIN; // 1000
const GRID_H = FOOTER_Y - HEADER_H; // 1400
const RADIUS = 28;

const BG = "#15131f";
const ACCENT = "#ffd23f";
// Needs a real font on the machine that runs this (on Ubuntu: sudo apt install fonts-dejavu-core).
const FONT = "DejaVu Sans, Helvetica, Arial, sans-serif";
const PLACEHOLDER_COLORS = ["#ff6b6b", "#4ecdc4", "#a78bfa", "#fbbf24", "#60a5fa", "#fb923c"];
// Rough glyph widths for bold DejaVu Sans, as a fraction of font size. Used to estimate
// wrapping. One flat average underestimates capitals and wide letters, which ran off the card.
const NARROW = /[iljIJ.,:;'!|()[\]]/;
const SEMI = /[frt\-"]/;
const WIDE_LOWER = /[mw]/;
const WIDE_UPPER = /[MW@%]/;

function charEm(ch: string): number {
  if (ch === " ") return 0.35;
  if (NARROW.test(ch)) return 0.34;
  if (SEMI.test(ch)) return 0.47;
  if (WIDE_LOWER.test(ch)) return 1.0;
  if (WIDE_UPPER.test(ch)) return 1.04;
  if (/[A-Z]/.test(ch)) return 0.78;
  if (/[0-9]/.test(ch)) return 0.7;
  return 0.66;
}

/** Estimated rendered width of `text` in px. */
function textWidth(text: string, size: number, letterSpacing = 0): number {
  let em = 0;
  for (const ch of text) em += charEm(ch);
  return em * size + letterSpacing * text.length;
}

/** How many characters of this kind of text fit on one line of `maxWidth` px. */
function charsPerLine(text: string, maxWidth: number, size: number): number {
  const avgEm = text.length ? textWidth(text, 1) / text.length : 0.66;
  return Math.max(1, Math.floor(maxWidth / (size * avgEm)));
}

// How many photos go in each row, by photo count.
const ROW_SPECS: Record<number, number[]> = {
  1: [1],
  2: [1, 1],
  3: [1, 2],
  4: [2, 2],
  5: [2, 3],
  6: [3, 3],
  7: [2, 2, 3],
  8: [2, 3, 3],
  9: [3, 3, 3],
};
export type CardTile = { image: Buffer | null; caption: string };
export type CardContent = {
  title: string;
  crewName: string;
  periodLabel: string;
  stats: { questsDone: number; photos: number; votes: number };
  tiles: CardTile[]; // 1 to MAX_TILES
};

type Rect = { x: number; y: number; w: number; h: number };

export function tileLayout(count: number): Rect[] {
  const rows = ROW_SPECS[count];
  if (!rows) throw new Error(`Collage supports 1 to ${MAX_TILES} photos, got ${count}`);
  const rowH = Math.floor((GRID_H - GAP * (rows.length - 1)) / rows.length);
  const rects: Rect[] = [];
  rows.forEach((cols, r) => {
    const colW = Math.floor((GRID_W - GAP * (cols - 1)) / cols);
    for (let c = 0; c < cols; c++) {
      rects.push({ x: MARGIN + c * (colW + GAP), y: HEADER_H + r * (rowH + GAP), w: colW, h: rowH });
    }
  });
  return rects;
}

/**
 * Caption length that fits each tile in 3 lines, in words, for a collage of `count` photos.
 * Matches the caption font sizes below; the recap prompt passes these to the model.
 */
export function captionWordBudgets(count: number): number[] {
  return tileLayout(count).map((r) => (r.w >= 600 ? 12 : r.w >= 400 ? 9 : 6));
}

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
    const lines = wrapLines(text, charsPerLine(text, maxWidth, size));
    if (lines.length <= maxLines) return { size, lines };
  }
  const size = sizes[sizes.length - 1];
  const maxChars = charsPerLine(text, maxWidth, size);
  return { size, lines: clampLines(wrapLines(text, maxChars), maxLines, maxChars) };
}

/**
 * The title must sit between the crew name and the photo grid. One line can be big;
 * two lines only fit the header at 60 px or less (bigger ran into the first photo).
 */
function fitTitle(text: string) {
  const oneLine = fitText(text, GRID_W, 1, [84, 72, 64]);
  if (oneLine.lines.length === 1 && !oneLine.lines[0].endsWith("…")) return oneLine;
  const twoLines = fitText(text, GRID_W, 2, [60, 52, 46]);
  return twoLines.lines.length === 2 && !twoLines.lines[1].endsWith("…")
    ? { size: twoLines.size, lines: balanceLines(text, charsPerLine(text, GRID_W, twoLines.size)) ?? twoLines.lines }
    : twoLines;
}

/** Splits at the word break that makes two lines closest in length, so one word isn't left alone. */
function balanceLines(text: string, maxChars: number): string[] | null {
  const words = text.split(" ");
  let best: string[] | null = null;
  for (let i = 1; i < words.length; i++) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    if (lines.some((line) => line.length > maxChars)) continue;
    const diff = Math.abs(lines[0].length - lines[1].length);
    if (!best || diff < Math.abs(best[0].length - best[1].length)) best = lines;
  }
  return best;
}

/** Single line, letter-spaced: shrink until it fits, then truncate. */
function fitOneLine(text: string, maxWidth: number, sizes: number[], letterSpacing: number) {
  for (const size of sizes) {
    if (textWidth(text, size, letterSpacing) <= maxWidth) return { size, line: text };
  }
  const size = sizes[sizes.length - 1];
  let line = text;
  while (line.length > 1 && textWidth(`${line}…`, size, letterSpacing) > maxWidth) line = line.slice(0, -1);
  return { size, line: line === text ? line : `${line.trimEnd()}…` };
}

// ---------- tiles ----------

function roundedMask(w: number, h: number): Buffer {
  return Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${w}" height="${h}" rx="${RADIUS}" ry="${RADIUS}" fill="#fff"/></svg>`,
  );
}

function frameTile(source: Buffer, rect: Rect): Promise<Buffer> {
  return sharp(source)
    .rotate() // apply the camera's rotation flag, or portrait phone photos come out sideways
    .resize(rect.w, rect.h, { fit: "cover", position: sharp.strategy.attention })
    .ensureAlpha()
    .composite([{ input: roundedMask(rect.w, rect.h), blend: "dest-in" }])
    .png()
    .toBuffer();
}

function placeholderTile(index: number, rect: Rect): Promise<Buffer> {
  const color = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];
  const svg =
    `<svg width="${rect.w}" height="${rect.h}" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="100%" height="100%" fill="${color}"/>` +
    `<circle cx="${rect.w * 0.7}" cy="${rect.h * 0.3}" r="${Math.min(rect.w, rect.h) * 0.25}" fill="#fff" fill-opacity="0.25"/>` +
    `<circle cx="${rect.w * 0.25}" cy="${rect.h * 0.6}" r="${Math.min(rect.w, rect.h) * 0.16}" fill="#000" fill-opacity="0.12"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function prepareTile(image: Buffer | null, index: number, rect: Rect): Promise<Buffer> {
  if (image) {
    try {
      return await frameTile(image, rect);
    } catch (error) {
      console.warn(`[recap] photo ${index + 1} undecodable, using placeholder:`, error);
    }
  }
  return frameTile(await placeholderTile(index, rect), rect);
}

// ---------- overlay (all text, borders, caption boxes in one SVG) ----------

function buildOverlay(content: CardContent, rects: Rect[]): string {
  const out: string[] = [];
  const centerX = CARD_WIDTH / 2;
  const text = (x: number, y: number, size: number, fill: string, body: string, extra = "") =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${fill}" text-anchor="middle" ${extra}>${escapeXml(body)}</text>`;

  // Header
  const crew = fitOneLine(sanitize(content.crewName).toUpperCase(), GRID_W, [34, 30, 26, 22], 4);
  out.push(text(centerX, 84, crew.size, ACCENT, crew.line, 'letter-spacing="4"'));
  const title = fitTitle(sanitize(content.title));
  // One line sits a little lower so it's centered in the space left in the header.
  const titleTop = title.lines.length === 1 ? 118 : 104;
  title.lines.forEach((line, i) => {
    out.push(text(centerX, titleTop + title.size + i * title.size * 1.1, title.size, "#fff", line));
  });

  // Tiles: border + caption box
  content.tiles.forEach((tile, i) => {
    const r = rects[i];
    out.push(
      `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${RADIUS}" ry="${RADIUS}" fill="none" stroke="#fff" stroke-width="6"/>`,
    );
    const size = r.w >= 600 ? 34 : r.w >= 400 ? 30 : 24;
    const lineH = Math.round(size * 1.27);
    const maxChars = charsPerLine(sanitize(tile.caption), r.w - 32 - 40, size);
    const lines = clampLines(wrapLines(sanitize(tile.caption), maxChars), 3, maxChars);
    if (lines.length === 0) return;
    const boxH = lines.length * lineH + 32;
    const boxY = r.y + r.h - 16 - boxH;
    out.push(
      `<rect x="${r.x + 16}" y="${boxY}" width="${r.w - 32}" height="${boxH}" rx="20" ry="20" fill="#000" fill-opacity="0.72"/>`,
    );
    lines.forEach((line, j) => {
      out.push(text(r.x + r.w / 2, boxY + 16 + Math.round(size * 0.95) + j * lineH, size, "#fff", line));
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
  const rects = tileLayout(content.tiles.length); // throws for 0 or more than MAX_TILES
  const framed = await Promise.all(content.tiles.map((t, i) => prepareTile(t.image, i, rects[i])));

  // Photos first, then one SVG on top holding all text, borders and caption boxes.
  const layers = [
    ...framed.map((input, i) => ({ input, left: rects[i].x, top: rects[i].y })),
    { input: Buffer.from(buildOverlay(content, rects)), left: 0, top: 0 },
  ];

  return sharp({ create: { width: CARD_WIDTH, height: CARD_HEIGHT, channels: 4, background: BG } })
    .composite(layers)
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}