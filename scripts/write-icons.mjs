/** Decode R-rocket logo icons for PWA install. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
const partsDir = path.join(__dirname, 'icons_parts');

fs.mkdirSync(outDir, { recursive: true });

const map = {
  icon_192x192: 'icon-192x192.png',
  apple_touch_icon: 'apple-touch-icon.png',
  icon_96x96: 'icon-96x96.png',
};

for (const [key, outName] of Object.entries(map)) {
  const p = path.join(partsDir, `${key}.b64`);
  if (!fs.existsSync(p)) continue;
  fs.writeFileSync(path.join(outDir, outName), Buffer.from(fs.readFileSync(p, 'utf8'), 'base64'));
}

const src192 = path.join(outDir, 'icon-192x192.png');
if (fs.existsSync(src192)) {
  for (const n of [
    'icon-512x512.png',
    'icon-maskable-192x192.png',
    'icon-maskable-512x512.png',
    'icon-128x128.png',
    'icon-144x144.png',
    'icon-152x152.png',
    'icon-256x256.png',
    'icon-384x384.png',
  ]) {
    fs.copyFileSync(src192, path.join(outDir, n));
  }
}
const src96 = path.join(outDir, 'icon-96x96.png');
if (fs.existsSync(src96)) fs.copyFileSync(src96, path.join(outDir, 'icon-72x72.png'));
const apple = path.join(outDir, 'apple-touch-icon.png');
if (fs.existsSync(apple)) fs.copyFileSync(apple, path.join(outDir, 'icon-180x180.png'));

console.log('Wrote PWA logo icons to public/icons');
