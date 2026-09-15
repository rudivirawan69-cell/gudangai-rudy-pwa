/** Generate PWA PNG icons from scripts/icons.json (prebuild on Vercel).
 *  Skip rewrite if icons already present in public/ — saves build time. */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

const names = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

// Fast path: icons already committed → no decode/write
if (names.every((n) => existsSync(join(publicDir, n)))) {
  console.log('[icons] skip — already in public/');
  process.exit(0);
}

const jsonPath = join(__dirname, 'icons.json');

if (existsSync(jsonPath)) {
  const map = JSON.parse(readFileSync(jsonPath, 'utf8'));
  for (const name of names) {
    const b64 = (map[name] || '').trim();
    if (!b64) {
      console.warn('[icons] missing key', name);
      continue;
    }
    const buf = Buffer.from(b64, 'base64');
    writeFileSync(join(publicDir, name), buf);
    console.log('[icons]', name, buf.length, 'bytes');
  }
} else {
  for (const name of names) {
    const p = join(__dirname, name + '.b64.txt');
    if (!existsSync(p)) {
      console.warn('[icons] missing', p);
      continue;
    }
    const b64 = readFileSync(p, 'utf8').trim();
    const buf = Buffer.from(b64, 'base64');
    writeFileSync(join(publicDir, name), buf);
    console.log('[icons]', name, buf.length, 'bytes');
  }
}
