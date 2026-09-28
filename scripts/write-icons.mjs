import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'icon-b64.json'), 'utf8'));
const outDir = path.join(__dirname, '..', 'public', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const [name, b64] of Object.entries(data)) {
  fs.writeFileSync(path.join(outDir, name), Buffer.from(b64, 'base64'));
}
console.log('Wrote', Object.keys(data).length, 'icons to public/icons');
