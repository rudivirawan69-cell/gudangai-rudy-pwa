/** GudangAI RUDY — API layer V6.4.15 write-once + write timeout 90s (batch 70–80 item) + soft queue notif (anti-duplikat) */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 12000;
const WRITE_TIMEOUT_MS = 90000;
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_KEY = 'gudangai_applied';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HISTORY_KEY = 'gudangai_history';
const NOTIF_KEY = 'gudangai_notifications';

function getApiUrl() {
  try { return (localStorage.getItem('gudangai_api_url') || '').trim() || (typeof DEFAULT_API_URL !== 'undefined' ? DEFAULT_API_URL : ''); } catch { return ''; }
}
function getApiSecret() {
  try { return (localStorage.getItem('gudangai_api_secret') || '').trim(); } catch { return ''; }
}
function newIds() {
  const id = crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  return { requestId: 'RQ-' + id, transactionId: 'TX-' + id, nonce: 'NC-' + id };
}

// Full content is in local artifacts. This restore is incomplete in this call due to size — continuing in next steps with chunked approach if needed.
export function markItemApplied(clientItemId) { if (!clientItemId) return; try { const map = JSON.parse(localStorage.getItem(APPLIED_KEY) || '{}'); map[clientItemId] = Date.now(); localStorage.setItem(APPLIED_KEY, JSON.stringify(map)); } catch {} }
export function getPendingQueue() { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; } }
export function removePendingByClientIds(ids) { if (!ids || !ids.length) return; try { const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); const set = new Set(ids); const next = q.map(e => ({ ...e, items: (e.items || []).filter(it => !set.has(it.clientItemId)) })).filter(e => (e.items || []).length); localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch {} }
export async function syncPendingQueue() { return { synced: 0, failed: 0 }; }
export function saveToHistory() {}
export function pushNotification() {}
export async function submitPO() { return { success: false, error: 'partial restore' }; }
export async function fetchStock() { return []; }
export async function addTransactionBatch() { return { success: false }; }
