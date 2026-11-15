// riwayatAdapter.js — normalisasi, penggabungan, pengelompokan, dan ekspor riwayat transaksi.
// Murni (tanpa efek samping), aman diuji dengan `node --test`. TIDAK menulis ke spreadsheet apa pun.

export const TZ = "Asia/Jakarta";
export const TIPE = ["masuk", "keluar", "rusak"];
export const STATUS_SYNC = ["terkirim", "antrian", "gagal", "lokal"];

const pick = (r, keys) => {
  for (const k of keys) if (r?.[k] !== undefined && r?.[k] !== null && r?.[k] !== "") return r[k];
  return undefined;
};

export function toNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v ?? "").trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function normTipe(v) {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("masuk") || s === "in") return "masuk";
  if (s.includes("keluar") || s === "out") return "keluar";
  if (s.includes("rusak") || s.includes("reject") || s === "damage") return "rusak";
  return null;
}

export function normEntitas(v) {
  const s = String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (s === "cv") return "CV";
  if (s === "pt") return "PT";
  if (s.startsWith("bahan") || s === "bb") return "Bahan Baku";
  return null;
}

export function normStatus(v, sumber) {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("gagal") || s.includes("fail") || s.includes("error")) return "gagal";
  if (s.includes("antrian") || s.includes("queue") || s.includes("pending")) return "antrian";
  if (s.includes("kirim") || s.includes("sync") || s.includes("ok") || s.includes("success")) return "terkirim";
  if (sumber === "spreadsheet") return "terkirim";
  return "lokal";
}

export function parseWaktu(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const n = v < 1e12 ? v * 1000 : v;
    return Number.isFinite(n) ? n : null;
  }
  const s = String(v).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  return null;
}

export function normItems(r) {
  const raw = r.items || r.detail || r.baris || r.lines || [];
  if (!Array.isArray(raw)) return [];
  return raw.map((it) => ({
    kode: String(it.kode ?? it.code ?? it.kodeBarang ?? "").trim(),
    nama: String(it.nama ?? it.name ?? "").trim(),
    qty: toNumber(it.qty ?? it.jumlah ?? it.quantity),
    satuan: String(it.satuan ?? it.unit ?? "").trim(),
  }));
}

export function normTx(r, sumber = "lokal") {
  const items = normItems(r);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const tipe = normTipe(r.type ?? r.tipe ?? r.jenis ?? r.action);
  const entitas = normEntitas(r.entity ?? r.entitas ?? r.divisi);
  const ts = parseWaktu(r.savedAt ?? r.at ?? r.timestamp ?? r.createdAt ?? r.tanggal ?? r.date);
  const status = normStatus(r.status ?? r.syncStatus ?? r.state, sumber);
  const id = String(r.id ?? r.requestId ?? r.transactionId ?? `${sumber}-${ts}-${tipe}-${items[0]?.kode || "x"}`);
  const kunci = String(r.transactionId || r.requestId || id);
  const anomali = items.length === 0 || totalQty <= 0 || !tipe;
  return {
    id,
    kunci,
    tipe,
    entitas,
    ts,
    status,
    sumber,
    items,
    totalQty,
    jumlahItem: items.length,
    keterangan: String(r.keterangan ?? r.note ?? r.notes ?? "").trim(),
    anomali,
  };
}

export function gabung(lokal = [], server = []) {
  const peta = new Map();
  lokal.map((r) => normTx(r, "lokal")).forEach((t) => peta.set(t.kunci, t));
  server.map((r) => normTx(r, "spreadsheet")).forEach((t) => peta.set(t.kunci, t));
  return [...peta.values()].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
}

const fmtHari = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const fmtJam = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false });
const fmtTanggal = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });

export const kunciHari = (ts) => (ts == null ? "tanpa-tanggal" : fmtHari.format(ts));
export const jamWIB = (ts) => (ts == null ? "--.--" : `${fmtJam.format(ts)} WIB`);

export function labelHari(key, now = Date.now()) {
  if (key === "tanpa-tanggal") return "Tanpa tanggal";
  if (key === kunciHari(now)) return "Hari ini";
  if (key === kunciHari(now - 86400000)) return "Kemarin";
  return fmtTanggal.format(new Date(`${key}T12:00:00+07:00`)).toUpperCase();
}

export function filterTx(list, { tipe = "semua", entitas = "semua", status = "semua", q = "" } = {}) {
  const k = q.trim().toLowerCase();
  return list.filter((t) => {
    if (tipe !== "semua" && t.tipe !== tipe) return false;
    if (entitas !== "semua" && t.entitas !== entitas) return false;
    if (status !== "semua" && t.status !== status) return false;
    if (!k) return true;
    return (
      (t.keterangan || "").toLowerCase().includes(k) ||
      t.items.some((i) => (i.nama || "").toLowerCase().includes(k) || (i.kode || "").toLowerCase().includes(k))
    );
  });
}

export function ringkasHari(list) {
  const r = { masuk: 0, keluar: 0, rusak: 0, transaksi: list.length };
  list.forEach((t) => {
    if (t.tipe && r[t.tipe] != null) r[t.tipe] += t.totalQty;
  });
  return r;
}

export function kelompokkan(list, now = Date.now()) {
  const valid = list.filter((t) => !t.anomali);
  const anomali = list.filter((t) => t.anomali);
  const m = new Map();
  valid.forEach((t) => {
    const k = kunciHari(t.ts);
    m.set(k, [...(m.get(k) || []), t]);
  });
  const hari = [...m.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, items]) => ({ key, label: labelHari(key, now), items, ringkas: ringkasHari(items) }));
  return { hari, anomali };
}

export function hitungStatus(list) {
  const c = { semua: list.length, terkirim: 0, antrian: 0, gagal: 0, lokal: 0 };
  list.forEach((t) => {
    if (c[t.status] != null) c[t.status] += 1;
  });
  return c;
}

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
/** CSV (pemisah titik koma), satu baris per item. */
export function keCSV(list) {
  const kepala = ["Tanggal", "Jam", "Tipe", "Entitas", "Kode", "Nama", "Qty", "Satuan", "Status", "Keterangan", "Sumber"];
  const baris = [];
  list.filter((t) => !t.anomali).forEach((t) => {
    t.items.forEach((i) =>
      baris.push([kunciHari(t.ts), jamWIB(t.ts), t.tipe, t.entitas ?? "", i.kode, i.nama, i.qty, i.satuan, t.status, t.keterangan, t.sumber])
    );
  });
  return "\uFEFF" + [kepala, ...baris].map((r) => r.map(esc).join(";")).join("\r\n");
}

export function ringkasanTeks(t) {
  const judul = `${(t.tipe || "").toUpperCase()} ${t.entitas ?? ""} — ${kunciHari(t.ts)} ${jamWIB(t.ts)}`;
  return [judul, ...t.items.map((i) => `• ${i.nama || i.kode} : ${i.qty} ${i.satuan}`.trim()), t.keterangan && `Ket: ${t.keterangan}`]
    .filter(Boolean)
    .join("\n");
}
