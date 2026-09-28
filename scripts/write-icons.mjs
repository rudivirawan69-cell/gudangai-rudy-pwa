/** Decode R-rocket logo icons for PWA install (all required sizes). */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
const partsDir = path.join(__dirname, 'icons_parts');
fs.mkdirSync(outDir, { recursive: true });

function loadB64(base) {
  const full = path.join(partsDir, `${base}.b64`);
  if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8').trim();
  const a = path.join(partsDir, `${base}_a.txt`);
  const b = path.join(partsDir, `${base}_b.txt`);
  if (fs.existsSync(a) && fs.existsSync(b)) {
    return fs.readFileSync(a, 'utf8').trim() + fs.readFileSync(b, 'utf8').trim();
  }
  return '';
}

const map = {
  icon_192x192: 'icon-192x192.png',
  icon_512x512: 'icon-512x512.png',
  apple_touch_icon: 'apple-touch-icon.png',
  icon_96x96: 'icon-96x96.png',
  icon_maskable_192: 'icon-maskable-192x192.png',
  icon_maskable_512: 'icon-maskable-512x512.png',
};

for (const [key, outName] of Object.entries(map)) {
  const b64 = loadB64(key);
  if (!b64) {
    console.warn('Missing b64 for', key);
    continue;
  }
  fs.writeFileSync(path.join(outDir, outName), Buffer.from(b64, 'base64'));
}

// Aliases / other sizes from nearest high-quality source
const src192 = path.join(outDir, 'icon-192x192.png');
const src512 = path.join(outDir, 'icon-512x512.png');
const src96 = path.join(outDir, 'icon-96x96.png');
const apple = path.join(outDir, 'apple-touch-icon.png');

if (fs.existsSync(src192)) {
  for (const n of [
    'icon-128x128.png',
    'icon-144x144.png',
    'icon-152x152.png',
  ]) {
    fs.copyFileSync(src192, path.join(outDir, n));
  }
}
if (fs.existsSync(src512)) {
  for (const n of [
    'icon-256x256.png',
    'icon-384x384.png',
  ]) {
    fs.copyFileSync(src512, path.join(outDir, n));
  }
}
if (fs.existsSync(src96)) {
  fs.copyFileSync(src96, path.join(outDir, 'icon-72x72.png'));
}
if (fs.existsSync(apple)) {
  fs.copyFileSync(apple, path.join(outDir, 'icon-180x180.png'));
}

// Fallback maskable if missing
if (!fs.existsSync(path.join(outDir, 'icon-maskable-192x192.png')) && fs.existsSync(src192)) {
  fs.copyFileSync(src192, path.join(outDir, 'icon-maskable-192x192.png'));
}
if (!fs.existsSync(path.join(outDir, 'icon-maskable-512x512.png')) && fs.existsSync(src512)) {
  fs.copyFileSync(src512, path.join(outDir, 'icon-maskable-512x512.png'));
}

console.log('Wrote PWA logo icons (R-rocket) to public/icons');
