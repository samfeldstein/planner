// Draws the app icon (a ring with a check, echoing the check button) straight to PNG with no
// dependencies. Opaque on purpose: iOS fills transparent pixels with black.
// Run: node tools/make-icons.mjs   (writes src/icons/)

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BG = [0x1f, 0x6f, 0x6b];
const FG = [0xff, 0xff, 0xff];
const RING = { r: 0.27, w: 0.05 };
const CHECK = { w: 0.06, points: [[-0.11, 0.0], [-0.03, 0.08], [0.12, -0.09]] };
const SAMPLES = 4;

function segDist(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Is the point (in 0..1 units, centered) inside the glyph?
function inGlyph(x, y) {
  const cx = x - 0.5;
  const cy = y - 0.5;
  if (Math.abs(Math.hypot(cx, cy) - RING.r) <= RING.w / 2) return true;
  const [a, b, c] = CHECK.points;
  return Math.min(segDist(cx, cy, a, b), segDist(cx, cy, b, c)) <= CHECK.w / 2;
}

function pixels(size) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (inGlyph((x + (sx + 0.5) / SAMPLES) / size, (y + (sy + 0.5) / SAMPLES) / size)) hits++;
        }
      }
      const k = hits / (SAMPLES * SAMPLES);
      for (let ch = 0; ch < 3; ch++) {
        raw[y * (size * 3 + 1) + 1 + x * 3 + ch] = Math.round(BG[ch] + (FG[ch] - BG[ch]) * k);
      }
    }
  }
  return raw;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB, no alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'icons');
  mkdirSync(dir, { recursive: true });
  for (const size of [180, 192, 512]) writeFileSync(join(dir, `${size}.png`), png(size));
  console.log('wrote 180, 192, 512');
}
