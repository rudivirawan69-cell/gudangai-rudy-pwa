/** Generate PWA PNG icons from scripts/*.b64.txt (prebuild on Vercel). */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

const names = ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];
for (const name of names) {
  const b64 = readFileSync(join(__dirname, name + '.b64.txt'), 'utf8').trim();
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(join(publicDir, name), buf);
  console.log('[icons]', name, buf.length, 'bytes');
}
