import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const chunkDir = path.join(root, 'src/data/.api_chunks');
const outFile = path.join(root, 'src/data/api.js');

function isCompleteApi(src) {
  return typeof src === 'string'
    && /BATCH_CHUNK_SIZE\s*=\s*\d+/.test(src)
    && src.includes('export async function submitBarangMasuk')
    && src.includes('bulkTransaction');
}

// Prefer existing complete api.js. Incomplete recovery chunks must not overwrite it.
if (fs.existsSync(outFile)) {
  const existing = fs.readFileSync(outFile, 'utf8');
  if (isCompleteApi(existing)) {
    let chunkCount = 0;
    try {
      if (fs.existsSync(chunkDir)) {
        chunkCount = fs.readdirSync(chunkDir).filter((f) => /^\d+\.txt$/.test(f)).length;
      }
    } catch (_) {}
    // Full recovery used 6 chunks; fewer means partial leftovers from failed restore.
    if (chunkCount > 0 && chunkCount < 6) {
      console.log('assemble-api: skip (api.js already complete; incomplete chunks ignored)', existing.length, 'chars');
      process.exit(0);
    }
    if (chunkCount === 0) {
      console.log('assemble-api: skip (api.js already complete, no chunks)', existing.length, 'chars');
      process.exit(0);
    }
  }
}

if (!fs.existsSync(chunkDir)) {
  if (fs.existsSync(outFile) && isCompleteApi(fs.readFileSync(outFile, 'utf8'))) {
    console.log('assemble-api: skip (no chunk dir, api.js complete)');
    process.exit(0);
  }
  console.error('assemble-api: no chunk dir and api.js incomplete');
  process.exit(1);
}

const files = fs.readdirSync(chunkDir).filter((f) => /^\d+\.txt$/.test(f)).sort((a, b) => Number(a) - Number(b));
if (!files.length) {
  if (fs.existsSync(outFile) && isCompleteApi(fs.readFileSync(outFile, 'utf8'))) {
    console.log('assemble-api: skip (no chunks, api.js complete)');
    process.exit(0);
  }
  console.error('assemble-api: no chunks in', chunkDir);
  process.exit(1);
}

const content = files.map((f) => fs.readFileSync(path.join(chunkDir, f), 'utf8')).join('');
if (!isCompleteApi(content)) {
  if (fs.existsSync(outFile) && isCompleteApi(fs.readFileSync(outFile, 'utf8'))) {
    console.log('assemble-api: skip write (assembled chunks incomplete; keeping existing api.js)');
    process.exit(0);
  }
  console.error('assemble-api: assembled content incomplete (need BATCH_CHUNK_SIZE + submitBarangMasuk + bulkTransaction)');
  process.exit(1);
}

fs.writeFileSync(outFile, content);
console.log('assemble-api: wrote', outFile, content.length, 'chars from', files.length, 'chunks');
