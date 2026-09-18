/** Generate PWA PNG icons from per-file base64 (prebuild). */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

const names = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
for (const name of names) {
  const p = join(__dirname, name + '.b64.txt');
  if (!existsSync(p)) {
    console.warn('[icons] missing', p);
    continue;
  }
  const buf = Buffer.from(readFileSync(p, 'utf8').trim(), 'base64');
  writeFileSync(join(publicDir, name), buf);
  console.log('[icons]', name, buf.length, 'bytes');
}
