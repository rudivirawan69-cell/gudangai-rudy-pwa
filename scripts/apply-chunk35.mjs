/**
 * Apply BATCH=35 + progress UI on api.js / InputPage.jsx
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiPath = path.join(root, 'src/data/api.js');
let api = fs.readFileSync(apiPath, 'utf8');
if (!api.includes('BATCH_CHUNK_SIZE')) throw new Error('api.js missing BATCH_CHUNK_SIZE');
api = api.replace(/\/\*\* GudangAI RUDY — API layer V6\.7\.\d+ stable-chunk \(BATCH=\d+\)[^\n]*\n\/\*\*[^\n]*\n/, '/** GudangAI RUDY — API layer V6.7.3 stable-chunk (BATCH=35) + queue serial fallback + tanggal YYYY-MM-DD */\n/** CHUNK-35-2026-10-07: 1 PDF (~70 item) ≈ 2 request; progress UI sukses/antrian akurat. */\n');
api = api.replace(/\/\*\* Chunk aman[^\n]*\nconst BATCH_CHUNK_SIZE = \d+;\nconst BATCH_TIMEOUT_MS = \d+;/, '/** Chunk aman: 35 item/POST — PDF maks ~70 item = 2 request. */\nconst BATCH_CHUNK_SIZE = 35;\nconst BATCH_TIMEOUT_MS = 100000;');
api = api.replace(/const data = await postJson\(payload, \{ retries: 2, timeoutMs: 90000 \}\);/, 'const data = await postJson(payload, { retries: 2, timeoutMs: BATCH_TIMEOUT_MS });');
if (!api.includes('queued: chunkResult?.queuedCount')) {
  api = api.replace(/function emitProgress\(sent, total, chunkResult\) \{\n  try \{ window\.dispatchEvent\(new CustomEvent\('gudangai-submit-progress', \{ detail: \{ sent, total, success: chunkResult\?\.successCount \|\| 0, failed: chunkResult\?\.failCount \|\| 0 \} \}\)\); \} catch \(_\) \{\}\n\}/,
    "function emitProgress(sent, total, chunkResult) {\n  try {\n    window.dispatchEvent(new CustomEvent('gudangai-submit-progress', {\n      detail: { sent, total, success: chunkResult?.successCount || 0, queued: chunkResult?.queuedCount || 0, failed: chunkResult?.failCount || 0 },\n    }));\n  } catch (_) {}\n}");
}
if (api.includes('totalFail += remainingItems.length;') && api.includes('const remainingItems = list.slice(i);')) {
  api = api.replace(/const remainingItems = list\.slice\(i\);\n      \/\/ HARD RULE: timeout\/unknown tidak boleh diubah menjadi serial retry\.\n      \/\/ Retry hanya boleh memakai identity\/batch yang sama setelah read-back\/status\n      \/\/ backend terverifikasi; jangan mengubah timeout menjadi write serial\.\n      if \(!options\.fromQueue\) enqueue\(action, entity, remainingItems, \{ tanggal \}\);\n      totalQueued \+= remainingItems\.length;\n      totalFail \+= remainingItems\.length;/,
    "const remainingItems = list.slice(i).filter((it) => !isApplied(it.clientItemId));\n      // HARD RULE: timeout/unknown tidak boleh diubah menjadi serial retry.\n      if (remainingItems.length && !options.fromQueue) enqueue(action, entity, remainingItems, { tanggal });\n      totalQueued += remainingItems.length;");
}
api = api.replace(/pushNotification\(\{\s*type: 'warning',\s*title: 'Write belum terkonfirmasi',\s*body: remainingItems\.length \+ ' item diamankan di Antrian Sinkronisasi\. Detail backend: ' \+ msg \+ '\. Jangan kirim ulang manual; verifikasi backend\/read-back terlebih dahulu\.',\s*\}\);/,
  "pushNotification({\n        type: 'warning',\n        title: totalSuccess > 0 ? 'Sebagian item perlu Antrian Sinkronisasi' : 'Item diamankan di Antrian Sinkronisasi',\n        body: totalSuccess + ' sukses · ' + remainingItems.length + ' antrian. Detail: ' + msg,\n      });");
api = api.replace(/if \(totalQueued > 0\) \{\s*pushNotification\(\{ type: 'warning', title: 'Sinkronisasi perlu dilanjutkan', body: totalSuccess \+ ' sukses · ' \+ totalQueued \+ ' masuk antrian · ' \+ totalFail \+ ' belum terkonfirmasi\. Antrian menyimpan ID unik untuk mencegah duplikasi\.' \}\);/,
  "if (totalQueued > 0) {\n    pushNotification({\n      type: 'warning',\n      title: totalSuccess > 0 ? 'Transaksi sebagian selesai' : 'Transaksi masuk Antrian Sinkronisasi',\n      body: totalSuccess + ' sukses · ' + totalQueued + ' antrian' + (totalFail ? ' · ' + totalFail + ' gagal konfirmasi' : '') + '. Lanjutkan dari Antrian bila perlu.',\n    });");
if (!api.includes('BATCH_CHUNK_SIZE = 35')) throw new Error('BATCH=35 not applied');
fs.writeFileSync(apiPath, api);
console.log('api.js OK', api.length);

const inputPath = path.join(root, 'src/pages/InputPage.jsx');
let input = fs.readFileSync(inputPath, 'utf8');
input = input.replace(/setSubmitProgress\(\{ sent: d\.sent \|\| 0, total: d\.total \|\| 0, success: d\.success \|\| 0, failed: d\.failed \|\| 0 \}\);/,
  "setSubmitProgress({\n        sent: Number(d.sent) || 0,\n        total: Number(d.total) || 0,\n        success: Number(d.success) || 0,\n        queued: Number(d.queued) || 0,\n        failed: Number(d.failed) || 0,\n      });");
input = input.replace(/Mengirim \{submitProgress\.sent\}\/\{submitProgress\.total\} · ok \{submitProgress\.success\} · antri \{submitProgress\.failed\}/,
  "{submitProgress.sent < submitProgress.total\n                  ? `Mengirim ${submitProgress.sent}/${submitProgress.total} · sukses ${submitProgress.success}` +\n                    (submitProgress.queued ? ` · antrian ${submitProgress.queued}` : '')\n                  : `Selesai kirim ${submitProgress.total} · sukses ${submitProgress.success}` +\n                    (submitProgress.queued ? ` · antrian ${submitProgress.queued}` : '') +\n                    (submitProgress.failed ? ` · gagal ${submitProgress.failed}` : '')}");
input = input.replace(/\{submitting \? 'Mengirim…' : `Kirim \$\{cart\.length\} item`\}/,
  "{submitting\n                ? (submitProgress\n                    ? `Mengirim ${submitProgress.sent}/${submitProgress.total}…`\n                    : 'Mengirim…')\n                : `Kirim ${cart.length} item`}");
input = input.replace(/title: confirmedItems\.length > 0 \? 'Sebagian transaksi masuk Antrian Sinkronisasi' : 'Transaksi masuk Antrian Sinkronisasi',\s*body: confirmedItems\.length \+ ' terkonfirmasi · ' \+ queuedCount \+ ' masuk antrian · ' \+\s*Math\.max\(0, cart\.length - confirmedItems\.length - queuedCount\) \+ ' belum teridentifikasi\. Tidak ada item dibuang\.'/,
  "title: confirmedItems.length > 0 ? 'Transaksi sebagian selesai' : 'Transaksi masuk Antrian Sinkronisasi',\n            body: confirmedItems.length + ' sukses · ' + queuedCount + ' antrian' +\n              (Math.max(0, cart.length - confirmedItems.length - queuedCount) ? ' · ' + Math.max(0, cart.length - confirmedItems.length - queuedCount) + ' belum teridentifikasi' : '') +\n              '. Tidak ada item dibuang.'");
input = input.replace(/setStatusBanner\(\s*\(confirmedItems\.length > 0 \? 'TERKONFIRMASI ' \+ confirmedItems\.length \+ ' · ' : ''\) \+\s*'ANTRIAN ' \+ queuedCount \+\s*\(failCount \? ' · BELUM TERKONFIRMASI ' \+ failCount : ''\) \+\s*' — belum ditulis dianggap pending\.'\s*\);/,
  "setStatusBanner(\n            confirmedItems.length + ' sukses · ' + queuedCount + ' antrian' +\n            (failCount ? ' · ' + failCount + ' gagal konfirmasi' : '') +\n            ' — lanjutkan dari Antrian bila perlu.'\n          );");
fs.writeFileSync(inputPath, input);
console.log('InputPage OK', input.length);

const asmPath = path.join(root, 'scripts/assemble-api.mjs');
if (fs.existsSync(asmPath)) {
  let asm = fs.readFileSync(asmPath, 'utf8');
  asm = asm.replace("src.includes('BATCH_CHUNK_SIZE = 20')", '/BATCH_CHUNK_SIZE\\s*=\\s*\\d+/.test(src)');
  asm = asm.replace('need BATCH=20 + submitBarangMasuk + bulkTransaction', 'need BATCH_CHUNK_SIZE + submitBarangMasuk + bulkTransaction');
  fs.writeFileSync(asmPath, asm);
  console.log('assemble-api OK');
}
console.log('apply-chunk35: done');
