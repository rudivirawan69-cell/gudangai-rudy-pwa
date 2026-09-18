/** Write compressed background WebP from base64 (prebuild). */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, '..', 'public', 'assets');
mkdirSync(assetsDir, { recursive: true });

const b64Path = join(__dirname, 'bg-gudangai.webp.b64.txt');
if (!existsSync(b64Path)) {
  console.warn('[assets] missing', b64Path);
  process.exit(0);
}
const buf = Buffer.from(readFileSync(b64Path, 'utf8').trim(), 'base64');
writeFileSync(join(assetsDir, 'bg-gudangai.webp'), buf);
console.log('[assets] bg-gudangai.webp', buf.length, 'bytes');
