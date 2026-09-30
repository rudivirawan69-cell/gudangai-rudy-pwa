/** PWA icons from rocket-R logo (468928). Supports a/b/c b64 parts + root PNG fallback. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'icons');
const partsDir = path.join(__dirname, 'icons_parts');
fs.mkdirSync(outDir, { recursive: true });

function loadB64(base) {
  const full = path.join(partsDir, `${base}.b64`);
  if (fs.existsSync(full)) {
    const t = fs.readFileSync(full, 'utf8').trim();
    if (t.length > 5000) return t;
  }
  const chunks = [];
  for (const suf of ['_a.txt', '_b.txt', '_c.txt', '_d.txt']) {
    const p = path.join(partsDir, `${base}${suf}`);
    if (fs.existsSync(p)) chunks.push(fs.readFileSync(p, 'utf8').trim());
  }
  if (chunks.length) return chunks.join('');
  return '';
}

function writePng(name, b64) {
  if (!b64) return false;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 500 || buf[0] !== 0x89 || buf[1] !== 0x50) {
      console.warn('Invalid PNG for', name, 'len=', buf.length);
      return false;
    }
    fs.writeFileSync(path.join(outDir, name), buf);
    console.log('Wrote', name, buf.length);
    return true;
  } catch (e) {
    console.warn('writePng', name, e.message);
    return false;
  }
}

function copyIf(src, destName) {
  if (!fs.existsSync(src)) return false;
  const st = fs.statSync(src);
  if (st.size < 500) return false;
  fs.copyFileSync(src, path.join(outDir, destName));
  console.log('Copied', destName, 'from', path.basename(src), st.size);
  return true;
}

const map = {
  icon_512x512: 'icon-512x512.png',
  icon_192x192: 'icon-192x192.png',
  icon_maskable_512: 'icon-maskable-512x512.png',
  icon_maskable_192: 'icon-maskable-192x192.png',
  icon_96x96: 'icon-96x96.png',
  apple_touch_icon: 'apple-touch-icon.png',
};
let ok = 0;
for (const [key, outName] of Object.entries(map)) {
  if (writePng(outName, loadB64(key))) ok += 1;
}

copyIf(path.join(root, 'icon-512.png'), 'icon-512x512.png');
copyIf(path.join(root, 'icon-192.png'), 'icon-192x192.png');

const src192 = path.join(outDir, 'icon-192x192.png');
const src512 = path.join(outDir, 'icon-512x512.png');
const src96 = path.join(outDir, 'icon-96x96.png');
const apple = path.join(outDir, 'apple-touch-icon.png');

if (fs.existsSync(src192)) {
  for (const n of ['icon-128x128.png', 'icon-144x144.png', 'icon-152x152.png']) {
    fs.copyFileSync(src192, path.join(outDir, n));
  }
  const m192 = path.join(outDir, 'icon-maskable-192x192.png');
  if (!fs.existsSync(m192) || fs.statSync(m192).size < 500) fs.copyFileSync(src192, m192);
}
if (fs.existsSync(src512)) {
  for (const n of ['icon-256x256.png', 'icon-384x384.png']) {
    fs.copyFileSync(src512, path.join(outDir, n));
  }
  const m512 = path.join(outDir, 'icon-maskable-512x512.png');
  if (!fs.existsSync(m512) || fs.statSync(m512).size < 500) fs.copyFileSync(src512, m512);
}
if (fs.existsSync(src96)) fs.copyFileSync(src96, path.join(outDir, 'icon-72x72.png'));
if (fs.existsSync(apple)) fs.copyFileSync(apple, path.join(outDir, 'icon-180x180.png'));

const must = ['icon-192x192.png', 'icon-512x512.png'];
const missing = must.filter((n) => !fs.existsSync(path.join(outDir, n)));
if (missing.length) console.error('PWA icons MISSING:', missing.join(', '));
else console.log('PWA rocket icons OK (192+512). decoded:', ok);
