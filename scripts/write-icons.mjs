/** Generate PWA PNG icons from scripts/icons.json (prebuild on Vercel). */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');
mkdirSync(publicDir, { recursive: true });

const icons = JSON.parse(readFileSync(join(__dirname, 'icons.json'), 'utf8'));
for (const [name, b64] of Object.entries(icons)) {
  const buf = Buffer.from(b64, 'base64');
  writeFileSync(join(publicDir, name), buf);
  console.log('[icons]', name, buf.length, 'bytes');
}
