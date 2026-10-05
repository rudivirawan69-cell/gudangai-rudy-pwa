import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const chunkDir = path.join(root, 'src/data/.api_chunks');
const outFile = path.join(root, 'src/data/api.js');

const files = fs.readdirSync(chunkDir).filter((f) => /^\d+\.txt$/.test(f)).sort((a, b) => Number(a) - Number(b));
if (!files.length) {
  console.error('assemble-api: no chunks in', chunkDir);
  process.exit(1);
}
const content = files.map((f) => fs.readFileSync(path.join(chunkDir, f), 'utf8')).join('');
if (!content.includes('BATCH_CHUNK_SIZE = 20')) {
  console.error('assemble-api: assembled api.js missing BATCH_CHUNK_SIZE = 20');
  process.exit(1);
}
if (!content.includes('export async function submitBarangMasuk')) {
  console.error('assemble-api: assembled api.js missing submitBarangMasuk');
  process.exit(1);
}
fs.writeFileSync(outFile, content);
console.log('assemble-api: wrote', outFile, content.length, 'chars from', files.length, 'chunks');
