// stokAdapter.js — normalisasi data stok untuk StokPage (murni, tanpa efek samping, bisa diuji).
// ATURAN: sisa stok SELALU dari "Stock Akhir", tidak pernah dari "Stock Awal".

// ATURAN STATUS = identik dengan Dashboard Live (classifyDashboardStock_ di Code.gs):
//   stok < 10 -> kritis ; stok < 20 -> waspada ; selain itu aman.
export const AMBANG = { KRITIS_DI_BAWAH: 10, WASPADA_DI_BAWAH: 20 };
// Penentu Bahan Baku (entitas CV/PT bisa juga dipakai item Bahan Baku).
export const BB = { divisiRegex: /bahan\s*baku/i, kodePrefix: [] };
export const ENTITAS = ["CV", "PT", "Bahan Baku"];

// Urutan prioritas field sisa stok. Field "awal" sengaja TIDAK ada di daftar ini.
// "stok" di depan karena mapStockItem di api.js mengisi field stok dari stockAkhir.
const FIELD_SISA = ["stok", "stockAkhir", "stokAkhir", "stock_akhir", "sisaStok", "sisa_stok", "sisa"];
const FIELD_AWAL = ["stockAwal", "stokAwal", "stock_awal", "awal"];
// stockAman = batas "stok aman" dari spreadsheet. Dipakai HANYA untuk saran restok, bukan untuk status.
const FIELD_MIN = ["stockAman", "stock_aman", "stokAman", "minStok", "min_stok", "stokMin", "minimum", "min"];

const pick = (r, keys) => {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== "") return r[k];
  return undefined;
};

export function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeEntitas(v) {
  const s = String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (s === "cv") return "CV";
  if (s === "pt") return "PT";
  if (s.startsWith("bahan") || s === "bb") return "Bahan Baku";
  return null;
}

export function hitungStatus(stok) {
  if (stok < AMBANG.KRITIS_DI_BAWAH) return "kritis";
  if (stok < AMBANG.WASPADA_DI_BAWAH) return "waspada";
  return "aman";
}

/** Tentukan entitas: sumber sheet/divisi/kode untuk Bahan Baku diprioritaskan di atas field entitas. */
export function tentukanEntitas(r, entitasDefault = null) {
  const sumber = String(r.sumber ?? r.sheet ?? r.source ?? "");
  if (/bahan/i.test(sumber)) return "Bahan Baku";
  if (BB.divisiRegex.test(String(r.divisi ?? r.division ?? ""))) return "Bahan Baku";
  const kode = String(r.kode ?? r.code ?? "");
  if (BB.kodePrefix.some((p) => kode.startsWith(p))) return "Bahan Baku";
  return normalizeEntitas(r.entitas ?? r.entity ?? entitasDefault);
}

export function norm(r, entitasDefault = null) {
  const mentah = pick(r, FIELD_SISA);
  const stok = toNumber(mentah);
  const min = toNumber(pick(r, FIELD_MIN));
  const status = hitungStatus(stok);
  const statusApi = String(r.status ?? "").trim().toLowerCase();
  return {
    kode: String(r.kode ?? r.code ?? "").trim(),
    nama: String(r.nama ?? r.name ?? "").trim() || "(tanpa nama)",
    divisi: String(r.divisi ?? r.division ?? "").trim() || "Lainnya",
    entitas: tentukanEntitas(r, entitasDefault),
    satuan: String(r.satuan ?? r.unit ?? "").trim(),
    stok,
    min,
    status,
    _statusBeda: ["kritis", "waspada", "aman"].includes(statusApi) && statusApi !== status,
    _tanpaSisa: mentah === undefined,
    _hanyaAwal: mentah === undefined && pick(r, FIELD_AWAL) !== undefined,
  };
}

export const TIDAK_TERKLASIFIKASI = "Tidak terklasifikasi";

/**
 * Normalisasi seluruh payload + laporan kualitas data.
 * Item tanpa entitas dikenal TIDAK dibuang: masuk grup "Tidak terklasifikasi".
 * Duplikat (kunci entitas + kode; bila kode kosong: entitas + nama + divisi) hanya dihitung SEKALI.
 */
export function normalizeAll(rows, { targetTotal = null } = {}) {
  const mentah = (rows || []).map((r) => norm(r));
  const tanpaEntitas = mentah.filter((i) => i.entitas === null).length;
  const diberi = mentah.map((i) => (i.entitas === null ? { ...i, entitas: TIDAK_TERKLASIFIKASI } : i));
  const lihat = new Set();
  const items = [];
  const duplikat = [];
  diberi.forEach((i) => {
    const k = `${i.entitas}|${(i.kode ? i.kode : `${i.nama}|${i.divisi}`).toLowerCase()}`;
    if (lihat.has(k)) duplikat.push(k);
    else { lihat.add(k); items.push(i); }
  });
  const perEntitas = Object.fromEntries(
    [...ENTITAS, TIDAK_TERKLASIFIKASI].map((e) => [e, items.filter((i) => i.entitas === e).length])
  );
  return {
    items,
    laporan: {
      baris: mentah.length,
      total: items.length,
      perEntitas,
      tanpaEntitas,
      duplikat,
      statusBeda: items.filter((i) => i._statusBeda).length,
      hanyaAwal: items.filter((i) => i._hanyaAwal).length,
      tanpaSisa: items.filter((i) => i._tanpaSisa).length,
      selisihTarget: targetTotal == null ? null : items.length - targetTotal,
    },
  };
}
