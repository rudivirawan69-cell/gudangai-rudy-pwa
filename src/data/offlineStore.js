/**
 * GudangAI RUDY — durable offline queue backup
 * Primary queue remains localStorage for fast UI reads; IndexedDB is the durable mirror.
 */
const DB_NAME = 'gudangai-offline-v1';
const STORE_NAME = 'kv';
const QUEUE_KEY = 'queueState:v1';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      try { req.result.createObjectStore(STORE_NAME); } catch (_) {}
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function tx(db, mode) {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function getQueueBackup() {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = tx(db, 'readonly').get(QUEUE_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (_) { resolve(null); }
  });
}

export async function persistQueueBackup(queue, revision) {
  const db = await openDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const req = tx(db, 'readwrite').put({
        revision: Number(revision) || 0,
        updatedAt: new Date().toISOString(),
        queue: Array.isArray(queue) ? queue : [],
      }, QUEUE_KEY);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch (_) { resolve(false); }
  });
}

export async function hydrateQueueBackup(readLocalState, writeLocalState) {
  try {
    const local = readLocalState?.() || { revision: 0, queue: [] };
    const backup = await getQueueBackup();
    if (!backup) {
      await persistQueueBackup(local.queue, local.revision || 1);
      return { restored: false, revision: local.revision || 1, queue: local.queue || [] };
    }
    const localRev = Number(local.revision) || 0;
    const backupRev = Number(backup.revision) || 0;
    const localQueue = Array.isArray(local.queue) ? local.queue : [];
    const backupQueue = Array.isArray(backup.queue) ? backup.queue : [];
    const entriesById = new Map();
    [...backupQueue, ...localQueue].forEach((entry) => {
      const id = String(entry?.id || `${entry?.createdAt || ''}:${entry?.type || ''}:${entry?.entity || ''}`);
      if (id && !entriesById.has(id)) entriesById.set(id, entry);
    });
    const queue = Array.from(entriesById.values());
    const revision = Math.max(localRev, backupRev, queue.length ? 1 : 0);
    const changed = queue.length !== localQueue.length || backupRev > localRev;
    if (changed) writeLocalState?.(queue, revision);
    await persistQueueBackup(queue, revision || 1);
    if (changed) {
      try { window.dispatchEvent(new CustomEvent('gudangai-queue-changed', { detail: { restored: backupRev > localRev, revision } })); } catch (_) {}
    }
    return { restored: backupRev > localRev, revision: revision || 1, queue };
  } catch (_) {
    return { restored: false, revision: 0, queue: [] };
  }
}
