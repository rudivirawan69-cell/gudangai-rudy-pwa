// riwayatAdapter.js — normalisasi, penggabungan, pengelompokan, dan ekspor riwayat.
// Murni (tanpa efek samping). Optimasi: cache hari/jam, haystack pencarian, push O(1).

export const TZ = "Asia/Jakarta";
export const TIPE = ["masuk", "keluar", "rusak"];
export const STATUS_SYNC = ["terkirim", "antrian", "gagal", "lokal"];

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
  const d = new Date(String(v).trim());
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

export function normItems(r) {
  const raw = r.items || r.detail || r.baris || r.lines || [];
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out = new Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    const it = raw[i] || {};
    out[i] = {
      kode: String(it.kode ?? it.code ?? it.kodeBarang ?? "").trim(),
      nama: String(it.nama ?? it.name ?? "").trim(),
      qty: toNumber(it.qty ?? it.jumlah ?? it.quantity),
      satuan: String(it.satuan ?? it.unit ?? "").trim(),
    };
  }
  return out;
}

const fmtHari = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const fmtJam = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fmtTanggal = new Intl.DateTimeFormat("id-ID", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export const kunciHari = (ts) => (ts == null ? "tanpa-tanggal" : fmtHari.format(ts));
export const jamWIB = (ts) => (ts == null ? "--.--" : `${fmtJam.format(ts)} WIB`);

export function normTx(r, sumber = "lokal") {
  const items = normItems(r);
  let totalQty = 0;
  for (let i = 0; i < items.length; i++) totalQty += items[i].qty;
  const tipe = normTipe(r.type ?? r.tipe ?? r.jenis ?? r.action);
  const entitas = normEntitas(r.entity ?? r.entitas ?? r.divisi);
  const ts = parseWaktu(r.savedAt ?? r.at ?? r.timestamp ?? r.createdAt ?? r.tanggal ?? r.date);
  const status = normStatus(r.status ?? r.syncStatus ?? r.state, sumber);
  const id = String(
    r.id ?? r.requestId ?? r.transactionId ?? `${sumber}-${ts}-${tipe}-${items[0]?.kode || "x"}`
  );
  const kunci = String(r.transactionId || r.requestId || id);
  const anomali = items.length === 0 || totalQty <= 0 || !tipe;
  const keterangan = String(r.keterangan ?? r.note ?? r.notes ?? "").trim();
  let hay = keterangan.toLowerCase();
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.nama) hay += " " + it.nama.toLowerCase();
    if (it.kode) hay += " " + it.kode.toLowerCase();
  }
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
    keterangan,
    anomali,
    hariKey: kunciHari(ts),
    jamLabel: jamWIB(ts),
    _hay: hay,
  };
}

export function gabung(lokal = [], server = []) {
  const peta = new Map();
  for (let i = 0; i < lokal.length; i++) {
    const t = normTx(lokal[i], "lokal");
    peta.set(t.kunci, t);
  }
  for (let i = 0; i < server.length; i++) {
    const t = normTx(server[i], "spreadsheet");
    peta.set(t.kunci, t);
  }
  const arr = Array.from(peta.values());
  arr.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
  return arr;
}

export function labelHari(key, now = Date.now()) {
  if (key === "tanpa-tanggal") return "Tanpa tanggal";
  if (key === kunciHari(now)) return "Hari ini";
  if (key === kunciHari(now - 86400000)) return "Kemarin";
  return fmtTanggal.format(new Date(`${key}T12:00:00+07:00`)).toUpperCase();
}

export function filterTx(list, { tipe = "semua", entitas = "semua", status = "semua", q = "" } = {}) {
  const k = q.trim().toLowerCase();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (tipe !== "semua" && t.tipe !== tipe) continue;
    if (entitas !== "semua" && t.entitas !== entitas) continue;
    if (status !== "semua" && t.status !== status) continue;
    if (k && !(t._hay || "").includes(k)) continue;
    out.push(t);
  }
  return out;
}

export function ringkasHari(list) {
  const r = { masuk: 0, keluar: 0, rusak: 0, transaksi: list.length };
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.tipe && r[t.tipe] != null) r[t.tipe] += t.totalQty;
  }
  return r;
}

export function kelompokkan(list, now = Date.now()) {
  const valid = [];
  const anomali = [];
  const m = new Map();
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.anomali) {
      anomali.push(t);
      continue;
    }
    valid.push(t);
    const k = t.hariKey || kunciHari(t.ts);
    let bucket = m.get(k);
    if (!bucket) {
      bucket = [];
      m.set(k, bucket);
    }
    bucket.push(t);
  }
  const keys = Array.from(m.keys()).sort((a, b) => (a < b ? 1 : -1));
  const hari = new Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const items = m.get(key);
    hari[i] = { key, label: labelHari(key, now), items, ringkas: ringkasHari(items) };
  }
  return { hari, anomali };
}

export function hitungStatus(list) {
  const c = { semua: list.length, terkirim: 0, antrian: 0, gagal: 0, lokal: 0 };
  for (let i = 0; i < list.length; i++) {
    const s = list[i].status;
    if (c[s] != null) c[s] += 1;
  }
  return c;
}

/** Satu lintasan: valid + hitung status + hitung tipe (untuk chip). */
export function ringkasKatalog(list) {
  const status = { semua: 0, terkirim: 0, antrian: 0, gagal: 0, lokal: 0 };
  const tipe = { semua: 0, masuk: 0, keluar: 0, rusak: 0 };
  let anomali = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.anomali) {
      anomali += 1;
      continue;
    }
    status.semua += 1;
    tipe.semua += 1;
    if (status[t.status] != null) status[t.status] += 1;
    if (tipe[t.tipe] != null) tipe[t.tipe] += 1;
  }
  return { status, tipe, anomali };
}

const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function keCSV(list) {
  const kepala = ["Tanggal", "Jam", "Tipe", "Entitas", "Kode", "Nama", "Qty", "Satuan", "Status", "Keterangan", "Sumber"];
  const baris = [kepala];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.anomali) continue;
    const items = t.items || [];
    for (let j = 0; j < items.length; j++) {
      const it = items[j];
      baris.push([
        t.hariKey || kunciHari(t.ts),
        t.jamLabel || jamWIB(t.ts),
        t.tipe,
        t.entitas ?? "",
        it.kode,
        it.nama,
        it.qty,
        it.satuan,
        t.status,
        t.keterangan,
        t.sumber,
      ]);
    }
  }
  return "\uFEFF" + baris.map((r) => r.map(esc).join(";")).join("\r\n");
}

export function ringkasanTeks(t) {
  const judul = `${(t.tipe || "").toUpperCase()} ${t.entitas ?? ""} — ${t.hariKey || kunciHari(t.ts)} ${t.jamLabel || jamWIB(t.ts)}`;
  const lines = [judul];
  const items = t.items || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    lines.push(`• ${it.nama || it.kode} : ${it.qty} ${it.satuan}`.trim());
  }
  if (t.keterangan) lines.push(`Ket: ${t.keterangan}`);
  return lines.join("\n");
}
