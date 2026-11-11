const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const ANTHROPIC_MODEL = 'claude-3-5-haiku-latest';
const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_ITEMS = 8;
const LIVE_DATA_CHAR_BUDGET = 3500;
const MAX_LIVE_ACTIONS = 2;
const READ_ONLY_ACTIONS = new Set([
  'ping', 'status', 'getConfig', 'getDashboard', 'getDashboardData',
  'getAllStock', 'getStockAll', 'getStockByCode', 'searchByName',
  'getLowStock', 'getTransactionHistory', 'getStatusPO', 'getPOStatus',
  'getSystemLog', 'bootstrap',
  'getStockDelta', 'getSyncMetrics', 'getLastUpdate', 'getPOAnalysis',
]);

const LIVE_INTENTS = [
  { action: 'searchByName', pattern: /\b(stok|stock|sisa)\b|stock akhir|stok akhir|berapa.*(stok|stock|sisa)|sisa (stok|barang)|cari (barang|item|kode)|nama barang|fillet|kode (cv|pt|wk)-?/i },
  { action: 'getAllStock', pattern: /semua stok|stok (cv|pt|semua|master|lengkap)|daftar (stok|barang)|inventory/i },
  { action: 'getDashboardData', pattern: /dashboard|ringkasan|rangkuman|kondisi gudang|overview/i },
  { action: 'getLowStock', pattern: /stok (menipis|kritis|rendah|habis)|low ?stock|di bawah minimum|hampir habis|kritis/i },
  { action: 'getStatusPO', pattern: /\bpo\b|purchase order|status po|pembelian/i },
  { action: 'getTransactionHistory', pattern: /riwayat|histori|history|transaksi (terakhir|hari ini|kemarin)|barang (masuk|keluar|rusak)/i },
  { action: 'getSystemLog', pattern: /system log|log sistem|log error|audit log/i },
  { action: 'getStockDelta', pattern: /perubahan (stok|terakhir)|yang (baru|berubah) (saja|hari ini)|delta|sinkronisasi|apa yang berubah/i },
  { action: 'getSyncMetrics', pattern: /metrik (sync|sinkronisasi)|performa (sync|koneksi)|seberapa sering (error|gagal)|kesehatan (sync|sistem)/i },
  { action: 'getPOAnalysis', pattern: /analisis po|rekomendasi (po|pembelian)|apa yang (harus|perlu) (di)?(pesan|beli)/i },
  { action: 'getConfig', pattern: /periode aktif|bulan (aktif|berjalan)|konfigurasi|timezone|versi backend/i },
];
