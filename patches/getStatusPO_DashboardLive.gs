/**
 * Patch getStatusPO V6.6.6 — tempel ke Code.gs (ganti fungsi getStatusPO lama).
 * Atau salin isi file Code.gs dari commit ini setelah digabung.
 *
 * Perubahan:
 * 1. Prefer baca tabel detail dari sheet "Dashboard Live"
 * 2. Qty Datang: Barang masuk sejak Tanggal PO, abaikan RETUR & awalan DARI
 * 3. Parameter opsional from/to + field tertunda
 * 4. Label status MENUNGGU / SEBAGIAN / SELESAI
 */

// Lihat implementasi lengkap di Code.gs (fungsi getStatusPO + readStatusPOFromDashboardLive_)
// setelah commit fix/po-dashboard-live digabung.
