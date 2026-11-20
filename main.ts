// news-image-20261120 — round 3 entry (builder session, written from scratch).
// "Sum up 20 November's world news in one image."
// Pure Node 22 stdlib: draws a 1024x1024 PNG programmatically (own PNG encoder
// + hand-written 5x7 bitmap font), no network, fully deterministic.
//
// Layout: a newspaper front page — the strongest of three candidate layouts
// built and compared in this session (the other two renders are kept under
// out/b and out/c for reference only).
//
// News verified 20 Nov 2026 (Reuters / AP / BBC / Telegraph front pages):
//  1. Trump, Xi and Putin hold first three-way summit in Shenzhen and issue a
//     four-point "peace declaration" (no nuclear war, UN reform, push to end
//     the war in Ukraine).
//  2. ICJ rules Myanmar committed genocide against the Rohingya (2017 campaign).
//  3. Anthropic's record $81.3bn IPO: shares close +17% at ~$97 on Nasdaq.
//  4. Houthi missile hits Riyadh's tallest tower (KAFD); Iran widens attacks
//     on Gulf tankers.
//  5. Markets slide: S&P 500 -2.0%, Nikkei -4.7%. COP31 closes in Antalya;
//     APEC adopts the Shenzhen Outlook on trade and AI.

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------------------------------------------------------------- palette ---
const PAPER: RGB = [248, 244, 232];
const INK: RGB = [17, 17, 17];
const RED: RGB = [178, 34, 34];
const NAVY: RGB = [20, 33, 61];
const NAVY2: RGB = [31, 48, 84];
const GOLD: RGB = [201, 162, 39];
const SKY: RGB = [183, 214, 232];
const SKY2: RGB = [214, 232, 242];
const GREY: RGB = [90, 90, 90];
const WHITE: RGB = [255, 255, 255];
const GREEN: RGB = [34, 120, 60];
const CREAM2: RGB = [238, 231, 214];

type RGB = [number, number, number];

// ------------------------------------------------------------------ canvas --
const px = new Uint8Array(W * H * 3);

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      const i = (yy * W + xx) * 3;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
}

function hline(x0: number, x1: number, y: number, c: RGB, t = 1): void {
  for (let k = 0; k < t; k++) fillRect(x0, y + k, x1 - x0, 1, c);
}

function vline(x: number, y0: number, y1: number, c: RGB, t = 1): void {
  for (let k = 0; k < t; k++) fillRect(x + k, y0, 1, y1 - y0, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (t <= 1) setPixel(x, y, c);
    else fillRect(x - Math.floor(t / 2), y - Math.floor(t / 2), t, t, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// Scanline polygon fill (convex or concave, non-zero rule via even-odd).
function fillPolygon(pts: Array<[number, number]>, c: RGB): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (let y = Math.max(0, Math.ceil(minY)); y <= Math.min(H - 1, Math.floor(maxY)); y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k]));
      const b = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = a; x <= b; x++) setPixel(x, y, c);
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, Math.ceil(cy + r)); y++) {
    const dy = y - cy;
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    const x0 = Math.max(0, Math.ceil(cx - dx));
    const x1 = Math.min(W - 1, Math.floor(cx + dx));
    for (let x = x0; x <= x1; x++) setPixel(x, y, c);
  }
}

function circleOutline(cx: number, cy: number, r: number, c: RGB, t = 2): void {
  for (let a = 0; a < 360; a += 0.5) {
    const rad = (a * Math.PI) / 180;
    for (let k = 0; k < t; k++) {
      setPixel(Math.round(cx + (r - k) * Math.cos(rad)), Math.round(cy + (r - k) * Math.sin(rad)), c);
    }
  }
}

function fillEllipse(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
  for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(H - 1, Math.ceil(cy + ry)); y++) {
    const dy = (y - cy) / ry;
    const dx = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const x0 = Math.max(0, Math.ceil(cx - dx));
    const x1 = Math.min(W - 1, Math.floor(cx + dx));
    for (let x = x0; x <= x1; x++) setPixel(x, y, c);
  }
}

// Five-pointed star centred at (cx, cy), outer radius r.
function fillStar(cx: number, cy: number, r: number, c: RGB): void {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 2) * 3 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    pts.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
  }
  fillPolygon(pts, c);
}

// -------------------------------------------------------------------- font --
// Hand-written 5x7 bitmap font. '#' = ink, '.' = empty. Uppercase + digits +
// punctuation only; all image text is set in capitals (newspaper style).
const GLYPHS: Record<string, string[]> = {
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ####", "#    ", "#    ", "# ###", "#   #", "#   #", " ### "],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  J: ["  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  "],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #"],
  N: ["#   #", "##  #", "##  #", "# # #", "#  ##", "#  ##", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "#   #", "# # #", "# # #", "## ##", "#   #"],
  X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "0": [" ### ", "#  ##", "# # #", "##  #", "#   #", "#   #", " ### "],
  "1": ["  #  ", " ##  ", "  #  ", "  #  ", "  #  ", "  #  ", " ### "],
  "2": [" ### ", "#   #", "    #", "   # ", "  #  ", " #   ", "#####"],
  "3": ["#### ", "    #", "    #", " ### ", "    #", "    #", "#### "],
  "4": ["   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # "],
  "5": ["#####", "#    ", "#### ", "    #", "    #", "#   #", " ### "],
  "6": [" ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### "],
  "7": ["#####", "    #", "   # ", "  #  ", "  #  ", "  #  ", "  #  "],
  "8": [" ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### "],
  "9": [" ### ", "#   #", "#   #", " ####", "    #", "    #", " ### "],
  " ": ["     ", "     ", "     ", "     ", "     ", "     ", "     "],
  ".": ["     ", "     ", "     ", "     ", "     ", " ##  ", " ##  "],
  ",": ["     ", "     ", "     ", "     ", " ##  ", " ##  ", " #   "],
  ";": ["     ", "     ", "     ", " ##  ", "     ", " ##  ", " #   "],
  ":": ["     ", " ##  ", " ##  ", "     ", " ##  ", " ##  ", "     "],
  "-": ["     ", "     ", "     ", " ### ", "     ", "     ", "     "],
  "!": ["  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "     ", "  #  "],
  "?": [" ### ", "#   #", "    #", "   # ", "  #  ", "     ", "  #  "],
  "/": ["    #", "    #", "   # ", "  #  ", " #   ", "#    ", "#    "],
  "(": ["   ##", "  #  ", " #   ", " #   ", " #   ", "  #  ", "   ##"],
  ")": ["##   ", "  #  ", "   # ", "   # ", "   # ", "  #  ", "##   "],
  "&": [" ##  ", "#  # ", "# #  ", " #   ", "# # #", "#  # ", " ## #"],
  "%": ["##  #", "## # ", "   # ", "  #  ", " #   ", "#  ##", "#  ##"],
  "'": ["  #  ", "  #  ", "     ", "     ", "     ", "     ", "     "],
  '"': [" # # ", " # # ", "     ", "     ", "     ", "     ", "     "],
  "+": ["     ", "  #  ", "  #  ", " ### ", "  #  ", "  #  ", "     "],
  "=": ["     ", "     ", " ### ", "     ", " ### ", "     ", "     "],
  $: ["  #  ", " ####", "# #  ", " ### ", "  # #", "#### ", "  #  "],
  "\u2022": ["     ", "     ", " ### ", " ### ", " ### ", "     ", "     "],
  "\u2014": ["     ", "     ", "     ", "#####", "     ", "     ", "     "],
  "\u2019": ["  #  ", "  #  ", "     ", "     ", "     ", "     ", "     "],
};

function drawChar(x: number, y: number, ch: string, s: number, c: RGB): void {
  const g = GLYPHS[ch] ?? GLYPHS["?"];
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (g[r][col] === "#") fillRect(x + col * s, y + r * s, s, s, c);
    }
  }
}

function textWidth(s: string, scale: number): number {
  if (s.length === 0) return 0;
  return s.length * 6 * scale - scale;
}

function drawText(x: number, y: number, s: string, scale: number, c: RGB): void {
  let cx = x;
  for (const ch of s.toUpperCase()) {
    drawChar(cx, y, ch, scale, c);
    cx += 6 * scale;
  }
}

function drawTextCentered(cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, c);
}

// Greedy word wrap to maxWidth pixels; returns lines (already upper-cased).
function wrapText(s: string, maxWidth: number, scale: number): string[] {
  const words = s.toUpperCase().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (textWidth(trial, scale) <= maxWidth || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawWrapped(
  x: number, y: number, s: string, scale: number, c: RGB,
  maxWidth: number, lineGap = 4,
): number {
  const lines = wrapText(s, maxWidth, scale);
  const lh = 7 * scale + lineGap;
  lines.forEach((ln, i) => drawText(x, y + i * lh, ln, scale, c));
  return lines.length;
}

function drawWrappedCentered(
  cx: number, y: number, s: string, scale: number, c: RGB,
  maxWidth: number, lineGap = 4,
): number {
  const lines = wrapText(s, maxWidth, scale);
  const lh = 7 * scale + lineGap;
  lines.forEach((ln, i) => drawTextCentered(cx, y + i * lh, ln, scale, c));
  return lines.length;
}

// ---------------------------------------------------------------- png out --
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePNG(): Buffer {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ icons --
// Small symbolic drawings used by the layouts. All hand-drawn primitives.

function drawGlobe(cx: number, cy: number, r: number): void {
  fillCircle(cx, cy, r, SKY);
  // latitude bands
  for (let k = 1; k <= 3; k++) {
    const yy = cy - r + (2 * r * k) / 4;
    const half = Math.sqrt(Math.max(0, r * r - (yy - cy) * (yy - cy)));
    hline(Math.round(cx - half), Math.round(cx + half), Math.round(yy), NAVY2, 2);
  }
  // meridians
  for (const f of [-0.5, 0, 0.5]) {
    for (let a = 0; a <= 180; a += 2) {
      const rad = (a * Math.PI) / 180;
      const x = cx + r * 0.62 * Math.sin(rad) * f * 2 + (f === 0 ? 0 : 0);
      const y = cy - r * Math.cos(rad);
      if (f === 0) setPixel(Math.round(cx), Math.round(y), NAVY2);
      else setPixel(Math.round(x), Math.round(y), NAVY2);
    }
  }
  // continents (abstract blobs)
  fillEllipse(cx - r * 0.42, cy - r * 0.28, r * 0.30, r * 0.20, GREEN);
  fillEllipse(cx + r * 0.38, cy + r * 0.05, r * 0.26, r * 0.34, GREEN);
  fillEllipse(cx - r * 0.05, cy + r * 0.45, r * 0.22, r * 0.16, GREEN);
  fillEllipse(cx + r * 0.55, cy - r * 0.45, r * 0.14, r * 0.12, GREEN);
  circleOutline(cx, cy, r, NAVY, 4);
}

function drawFlagUS(x: number, y: number, w: number, h: number): void {
  const stripeH = h / 13;
  for (let i = 0; i < 13; i++) {
    fillRect(x, Math.round(y + i * stripeH), w, Math.ceil(stripeH) + 1,
      i % 2 === 0 ? RED : WHITE);
  }
  const cw = Math.round(w * 0.42);
  const ch = Math.round(h * 0.54);
  fillRect(x, y, cw, ch, NAVY);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      fillRect(x + 4 + c * Math.floor((cw - 8) / 5), y + 3 + r * Math.floor((ch - 6) / 4), 2, 2, WHITE);
    }
  }
}

function drawFlagCN(x: number, y: number, w: number, h: number): void {
  fillRect(x, y, w, h, RED);
  fillStar(x + Math.round(w * 0.22), y + Math.round(h * 0.28), Math.round(h * 0.20), GOLD);
  fillStar(x + Math.round(w * 0.55), y + Math.round(h * 0.16), Math.round(h * 0.09), GOLD);
  fillStar(x + Math.round(w * 0.68), y + Math.round(h * 0.32), Math.round(h * 0.09), GOLD);
  fillStar(x + Math.round(w * 0.68), y + Math.round(h * 0.52), Math.round(h * 0.09), GOLD);
  fillStar(x + Math.round(w * 0.55), y + Math.round(h * 0.66), Math.round(h * 0.09), GOLD);
}

function drawFlagRU(x: number, y: number, w: number, h: number): void {
  const band = Math.round(h / 3);
  fillRect(x, y, w, band, WHITE);
  fillRect(x, y + band, w, band, [0, 90, 170]);
  fillRect(x, y + 2 * band, w, h - 2 * band, RED);
}

function drawScales(cx: number, y: number, s: number, c: RGB): void {
  // Balance / scales of justice, s = overall height.
  const top = y;
  const mid = y + s;
  vline(cx, top + 4, mid, c, 3);
  fillCircle(cx, top + 2, 4, c);
  hline(cx - s * 0.42, cx + s * 0.42, top + 8, c, 3);
  const arm = s * 0.42;
  for (const side of [-1, 1]) {
    const px0 = cx + side * arm;
    line(px0, top + 8, px0 - side * 10, mid - 12, c, 2);
    line(px0, top + 8, px0 + side * 10, mid - 12, c, 2);
    fillPolygon([[px0 - 16, mid - 12], [px0 + 16, mid - 12], [px0, mid + 2]], c);
  }
  fillRect(cx - 16, mid, 32, 4, c);
  fillRect(cx - 22, mid + 4, 44, 4, c);
}

function drawChart(cx: number, y: number, w: number, h: number, c: RGB): void {
  // Rising bars + arrow.
  const base = y + h;
  const bars = [0.35, 0.5, 0.45, 0.7, 0.62, 0.95];
  const bw = Math.floor(w / (bars.length * 2));
  bars.forEach((f, i) => {
    const bx = cx - Math.floor(w / 2) + i * 2 * bw + 2;
    fillRect(bx, Math.round(base - f * h), bw, Math.round(f * h), i === bars.length - 1 ? GREEN : c);
  });
  hline(cx - Math.floor(w / 2), cx + Math.floor(w / 2), base, INK, 3);
  line(cx - Math.floor(w / 2) + 4, Math.round(base - 0.30 * h),
    cx + Math.floor(w / 2) - 6, Math.round(base - 0.88 * h), RED, 3);
  // arrowhead
  const ax = cx + Math.floor(w / 2) - 6;
  const ay = Math.round(base - 0.88 * h);
  fillPolygon([[ax, ay - 8], [ax + 10, ay + 2], [ax - 2, ay + 6]], RED);
}

function drawTower(cx: number, y: number, h: number): void {
  // Riyadh's tallest tower, stylised: stepped skyscraper + flame at top.
  const w = Math.round(h * 0.34);
  fillRect(cx - Math.floor(w / 2), y + Math.round(h * 0.25), w, Math.round(h * 0.75), NAVY2);
  fillRect(cx - Math.floor(w * 0.32), y + Math.round(h * 0.12), Math.round(w * 0.64), Math.round(h * 0.16), NAVY2);
  fillRect(cx - Math.floor(w * 0.2), y, Math.round(w * 0.4), Math.round(h * 0.14), NAVY2);
  for (let r = 0; r < 6; r++) {
    for (let col = 0; col < 3; col++) {
      fillRect(cx - Math.floor(w / 2) + 6 + col * Math.floor((w - 12) / 3),
        y + Math.round(h * 0.3) + r * Math.floor(h * 0.11), 5, 6, GOLD);
    }
  }
  // flame / blast above the crown
  fillPolygon([
    [cx - 12, y - 6], [cx - 4, y - 26], [cx + 2, y - 10],
    [cx + 10, y - 28], [cx + 14, y - 6],
  ], [230, 120, 20]);
  fillCircle(cx - 22, y - 30, 5, GREY);
  fillCircle(cx + 24, y - 38, 6, GREY);
}

// ------------------------------------------------------------- mastheads ---
function mastheadFrontPage(): void {
  fillRect(0, 0, W, H, PAPER);
  // top rules
  hline(36, W - 36, 26, INK, 3);
  hline(36, W - 36, 32, INK, 1);
  drawTextCentered(W / 2, 44, "THE WORLD", 8, INK);
  hline(36, W - 36, 116, RED, 4);
  // dateline row
  drawText(36, 132, "FRIDAY, 20 NOVEMBER 2026", 2, INK);
  const right = "THE DAY IN ONE PAGE";
  drawText(W - 36 - textWidth(right, 2), 132, right, 2, INK);
  hline(36, W - 36, 158, INK, 2);
}

function tickerBand(y: number, h: number, text: string): void {
  fillRect(0, y, W, h, NAVY);
  drawWrappedCentered(W / 2, y + 14, text, 2, WHITE, W - 80, 6);
}

// -------------------------------------------------------------- variant A --
// Front page: masthead + hero summit scene + big headline + 3 columns.
function layoutFrontPage(): void {
  mastheadFrontPage();
  // kicker
  drawTextCentered(W / 2, 176, "THE BIG STORY  •  SHENZHEN SUMMIT", 2, RED);
  // hero scene: sky, sun, three flags over a table
  const sceneY = 206;
  const sceneH = 178;
  fillRect(36, sceneY, W - 72, sceneH, SKY2);
  // sun
  fillCircle(880, sceneY + 42, 26, GOLD);
  // ground line + table
  fillRect(36, sceneY + sceneH - 26, W - 72, 26, CREAM2);
  hline(36, W - 36, sceneY + sceneH - 26, NAVY, 2);
  // globe on the table, centre
  drawGlobe(512, sceneY + sceneH - 52, 34);
  // three flags on poles
  const flags: Array<[number, (x: number, y: number, w: number, h: number) => void]> = [
    [300, drawFlagUS], [512, drawFlagCN], [724, drawFlagRU],
  ];
  for (const [cx, fn] of flags) {
    vline(cx - 62, sceneY + 18, sceneY + sceneH - 26, INK, 3);
    fn(cx - 58, sceneY + 18, 116, 72);
  }
  // name plates under the table
  drawTextCentered(300, sceneY + sceneH - 20, "USA", 2, NAVY);
  drawTextCentered(512, sceneY + sceneH - 20, "CHINA", 2, NAVY);
  drawTextCentered(724, sceneY + sceneH - 20, "RUSSIA", 2, NAVY);
  // headline
  drawTextCentered(W / 2, 404, "TRUMP, XI AND PUTIN", 4, INK);
  drawTextCentered(W / 2, 440, "ISSUE PEACE DECLARATION", 4, INK);
  drawWrappedCentered(W / 2, 492,
    "FIRST THREE-WAY SUMMIT ENDS WITH A PLEDGE: NO NUCLEAR WAR, UN REFORM — AND A PUSH TO END THE WAR IN UKRAINE.",
    2, GREY, 880, 6);
  hline(36, W - 36, 566, INK, 2);
  // three columns
  const cols = [
    {
      icon: "scales" as const,
      head: "COURT: MYANMAR COMMITTED GENOCIDE",
      body: "UN JUDGES IN THE HAGUE RULE THE 2017 CAMPAIGN AGAINST THE ROHINGYA WAS GENOCIDE.",
    },
    {
      icon: "chart" as const,
      head: "ANTHROPIC SOARS 17% IN RECORD IPO",
      body: "$81.3BN LISTING CLOSES AT $97 — EVEN AS WORLD MARKETS SLIDE.",
    },
    {
      icon: "tower" as const,
      head: "MISSILE HITS RIYADH'S TALLEST TOWER",
      body: "HOUTHIS STRIKE THE SAUDI CAPITAL; IRAN WIDENS ATTACKS ON GULF TANKERS.",
    },
  ];
  const colW = 296;
  const gap = 20;
  cols.forEach((col, i) => {
    const x = 36 + i * (colW + gap);
    const cx = x + colW / 2;
    if (col.icon === "scales") drawScales(cx, 592, 62, NAVY);
    if (col.icon === "chart") drawChart(cx, 592, 120, 62, NAVY2);
    if (col.icon === "tower") drawTower(cx, 584, 74);
    const headLines = drawWrappedCentered(cx, 676, col.head, 2, INK, colW, 5);
    drawWrapped(x, 676 + headLines * 19 + 8, col.body, 2, GREY, colW, 5);
    if (i < 2) vline(x + colW + 10, 592, 868, [200, 192, 172], 1);
  });
  hline(36, W - 36, 884, INK, 2);
  tickerBand(900, 84,
    "MARKETS: S&P 500 -2.0%  •  NIKKEI -4.7%  •  COP31 CLOSES IN ANTALYA  •  APEC ADOPTS SHENZHEN OUTLOOK");
  drawTextCentered(W / 2, 996, "THE WORLD — FRIDAY 20 NOVEMBER 2026", 1, GREY);
}

// ------------------------------------------------------------------- main --
// Chosen layout: the front page (variant A) — the strongest of the three
// candidates built and compared in this session.
layoutFrontPage();

const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "out";
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "entry.png"), encodePNG());
