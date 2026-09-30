/** PWA icons: prefer repo-root icon-512.png / icon-192.png, else b64 parts */
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
    if (t.length > 5000) return t; // reject truncated stubs
  }
  const a = path.join(partsDir, `${base}_a.txt`);
  const b = path.join(partsDir, `${base}_b.txt`);
  if (fs.existsSync(a) && fs.existsSync(b)) {
    const t = fs.readFileSync(a, 'utf8').trim() + fs.readFileSync(b, 'utf8').trim();
    if (t.length > 5000) return t;
  }
  return '';
}

function writePng(name, b64) {
  if (!b64) return false;
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 1000 || buf[0] !== 0x89 || buf[1] !== 0x50) {
      console.warn('Invalid/too-small PNG for', name, 'len=', buf.length);
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

// 1) Prefer solid binary icons already in repo root (Chrome needs 192 + 512)
const root512 = path.join(root, 'icon-512.png');
const root192 = path.join(root, 'icon-192.png');
copyIf(root512, 'icon-512x512.png');
copyIf(root192, 'icon-192x192.png');
copyIf(root512, 'icon-maskable-512x512.png');
copyIf(root192, 'icon-maskable-192x192.png');

// 2) b64 sources fill gaps (96, apple, etc.)
const map = {
  icon_192x192: 'icon-192x192.png',
  icon_512x512: 'icon-512x512.png',
  apple_touch_icon: 'apple-touch-icon.png',
  icon_96x96: 'icon-96x96.png',
  icon_maskable_192: 'icon-maskable-192x192.png',
  icon_maskable_512: 'icon-maskable-512x512.png',
};
let ok = 0;
for (const [key, outName] of Object.entries(map)) {
  const dest = path.join(outDir, outName);
  if (fs.existsSync(dest) && fs.statSync(dest).size >= 1000) continue;
  if (writePng(outName, loadB64(key))) ok += 1;
}

// 3) Aliases for manifest sizes
const src192 = path.join(outDir, 'icon-192x192.png');
const src512 = path.join(outDir, 'icon-512x512.png');
const src96 = path.join(outDir, 'icon-96x96.png');
const apple = path.join(outDir, 'apple-touch-icon.png');

if (fs.existsSync(src192)) {
  for (const n of ['icon-128x128.png', 'icon-144x144.png', 'icon-152x152.png']) {
    fs.copyFileSync(src192, path.join(outDir, n));
  }
  if (!fs.existsSync(path.join(outDir, 'icon-maskable-192x192.png'))) {
    fs.copyFileSync(src192, path.join(outDir, 'icon-maskable-192x192.png'));
  }
}
if (fs.existsSync(src512)) {
  for (const n of ['icon-256x256.png', 'icon-384x384.png']) {
    fs.copyFileSync(src512, path.join(outDir, n));
  }
  if (!fs.existsSync(path.join(outDir, 'icon-maskable-512x512.png'))) {
    fs.copyFileSync(src512, path.join(outDir, 'icon-maskable-512x512.png'));
  }
}
if (fs.existsSync(src96)) fs.copyFileSync(src96, path.join(outDir, 'icon-72x72.png'));
if (fs.existsSync(apple)) fs.copyFileSync(apple, path.join(outDir, 'icon-180x180.png'));

const must = ['icon-192x192.png', 'icon-512x512.png'];
const missing = must.filter((n) => !fs.existsSync(path.join(outDir, n)));
if (missing.length) {
  console.error('PWA install icons MISSING (Chrome needs 192+512):', missing.join(', '));
} else {
  console.log('PWA icons OK (192+512 present). extra b64:', ok);
}
