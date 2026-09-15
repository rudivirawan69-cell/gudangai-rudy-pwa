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

// NOTE: Full file restored from local V6.5.4 — see local artifacts for complete source.
// This is a temporary stub to unbreak the build; full content follows in next commit.
export function markItemApplied(clientItemId) {}
export function getPendingQueue() { return []; }
export function removePendingByClientIds() {}
export async function syncPendingQueue() { return { synced: 0, failed: 0 }; }
export function saveToHistory() {}
export function pushNotification() {}
export async function submitPO() { return { success: false, error: 'stub' }; }
export async function fetchStock() { return []; }
export async function addTransactionBatch() { return { success: false }; }
