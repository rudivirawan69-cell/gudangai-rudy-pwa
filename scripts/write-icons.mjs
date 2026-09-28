/**
 * Generate minimal valid PNG icons (no external deps) so PWA is installable.
 * Android requires real PNG 192 + 512 (not HTML SPA fallback).
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Solid-color PNG with simple centered lighter square (logo-ish). */
function makePng(size, bg = [5, 32, 43], fg = [8, 145, 178]) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const margin = Math.floor(size * 0.18);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const inSquare = x >= margin && x < size - margin && y >= margin && y < size - margin;
      const [r, g, b] = inSquare ? fg : bg;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
    }
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(outDir, { recursive: true });
const sizes = [72, 96, 128, 144, 152, 180, 192, 256, 384, 512];
for (const s of sizes) {
  fs.writeFileSync(path.join(outDir, `icon-${s}x${s}.png`), makePng(s));
}
fs.writeFileSync(path.join(outDir, 'icon-maskable-192x192.png'), makePng(192));
fs.writeFileSync(path.join(outDir, 'icon-maskable-512x512.png'), makePng(512));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), makePng(180));
console.log('Wrote', sizes.length + 3, 'PNG icons to public/icons');
