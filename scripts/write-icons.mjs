/** Decode committed logo icons into public/icons for PWA install. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
const partsDir = path.join(__dirname, 'icons_parts');

const nameMap = {
  icon_512x512: 'icon-512x512.png',
  icon_192x192: 'icon-192x192.png',
  apple_touch_icon: 'apple-touch-icon.png',
  icon_96x96: 'icon-96x96.png',
  icon_maskable_512x512: 'icon-maskable-512x512.png',
  icon_maskable_192x192: 'icon-maskable-192x192.png',
};

fs.mkdirSync(outDir, { recursive: true });
let n = 0;
if (fs.existsSync(partsDir)) {
  for (const [key, outName] of Object.entries(nameMap)) {
    const p = path.join(partsDir, `${key}.b64`);
    if (!fs.existsSync(p)) continue;
    fs.writeFileSync(path.join(outDir, outName), Buffer.from(fs.readFileSync(p, 'utf8'), 'base64'));
    n++;
  }
}
const j = path.join(__dirname, 'icon-b64.json');
if (n === 0 && fs.existsSync(j)) {
  const data = JSON.parse(fs.readFileSync(j, 'utf8'));
  for (const [name, b64] of Object.entries(data)) {
    fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
    n++;
  }
}

const aliases = {
  'icon-72x72.png': 'icon-96x96.png',
  'icon-128x128.png': 'icon-192x192.png',
  'icon-144x144.png': 'icon-192x192.png',
  'icon-152x152.png': 'icon-192x192.png',
  'icon-180x180.png': 'apple-touch-icon.png',
  'icon-256x256.png': 'icon-512x512.png',
  'icon-384x384.png': 'icon-512x512.png',
};
for (const [dest, src] of Object.entries(aliases)) {
  const from = path.join(outDir, src);
  const to = path.join(outDir, dest);
  if (fs.existsSync(from)) fs.copyFileSync(from, to);
}
console.log('Wrote', n, 'PWA logo icons to public/icons');
