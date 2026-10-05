/** GudangAI RUDY — API layer V6.7.2 stable-chunk (BATCH=20) + queue serial fallback + tanggal YYYY-MM-DD
 * Deploy marker 2026-10-05: force production to BATCH=20 (anti-timeout bulkTransaction). */
const RETRY_COUNT = 2;
const RETRY_BASE_MS = 400;
const REQUEST_TIMEOUT_MS = 15000;
/** Chunk aman agar Apps Script + spreadsheet selesai < timeout (anti-antrian). 20 item per POST. */
const BATCH_CHUNK_SIZE = 20;
const BATCH_TIMEOUT_MS = 90000;
const SINGLE_TIMEOUT_MS = 60000;
const SCHEMA_VERSION = '1.0';
const SAFE_WRITE_BACKEND_RE = /STOCK-READONLY|STOCK-SOURCE-LOCKED|6\.6\.5\+?BULK[-_]?STABLE|6\.6\.[5-9]|V?6\.6\.[5-9]|BULK[-_]?STABLE/i;

const APPLIED_KEY = 'gudangai_applied';
const QUEUE_KEY = 'gudangai_queue';
const APPLIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIF_KEY = 'gudangai_notif';
const DEFAULT_API_URL = 'https://script.google.com/macros/s/AKfycbxVpw0_waeCautJTG0R-jZQKBoxjTLXl5PGYCUBULccKhW8IQAoGRQFEqaCy6MkcnZqlQ/exec';
// Keep the proven V6.6.5 write authentication fallback. Existing localStorage secret still takes precedence.
const DEFAULT_API_SECRET = 'adadd47759234a7f94acb230c0cc7ff479c4e4f79a674714';
let _syncLock = false;
let _queueRevision = 0;
let _batchSupported = null;

import { hydrateQueueBackup, persistQueueBackup } from './offlineStore';
