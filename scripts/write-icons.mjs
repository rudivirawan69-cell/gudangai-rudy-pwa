/** Decode committed logo icons into public/icons for PWA install. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'icon-b64.json'), 'utf8'));

fs.mkdirSync(outDir, { recursive: true });
for (const [name, b64] of Object.entries(data)) {
  fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
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
console.log('Wrote PWA logo icons to public/icons');
