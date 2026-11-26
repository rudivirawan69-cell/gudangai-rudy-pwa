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

function entitasDariKode(kode) {
  const prefix = String(kode ?? "").trim().toUpperCase().split("-")[0];
  if (prefix === "CV" || prefix === "BBCV") return "CV";
  if (prefix === "PT" || prefix === "WK" || prefix === "MM" || prefix === "BBPT") return "PT";
  return null;
}

/** Ubah baris datar getTransactionHistory Apps Script menjadi transaksi yang dapat dirender Riwayat. */
export function normalisasiRiwayatServer(rows, sheetName) {
  const tipe = normTipe(sheetName);
  if (!tipe || !Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const kode = String(row?.kode ?? row?.kodeBarang ?? row?.code ?? "").trim();
    const rowNumber = Number(row?.row ?? row?.rowNumber) || index + 1;
    const transactionId = String(row?.transactionId ?? row?.transaction_id ?? "").trim();
    const requestId = String(row?.requestId ?? row?.request_id ?? "").trim();
    const id = transactionId || requestId || `${sheetName}:${rowNumber}`;
    const entitas = normEntitas(row?.entitas ?? row?.entity) || entitasDariKode(kode);
    const at = row?.at ?? row?.timestamp ?? row?.tanggal ?? row?.date ?? row?.createdAt ?? null;
    const qty = toNumber(row?.qty ?? row?.jumlah ?? row?.quantity);
    return {
      id,
      transactionId,
      requestId,
      type: tipe,
      entity: entitas,
      entitas,
      at,
      timestamp: at,
      savedAt: at,
      status: "success",
      items: [{
        kode,
        nama: String(row?.nama ?? row?.name ?? "").trim(),
        qty,
        satuan: String(row?.satuan ?? row?.unit ?? "").trim(),
      }],
      keterangan: String(row?.keterangan ?? row?.note ?? row?.notes ?? "").trim(),
      source: "spreadsheet",
    };
  });
}

export function parseWaktu(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const n = v < 1e12 ? v * 1000 : v;
    if (!Number.isFinite(n)) return null;
    const y = new Date(n).getFullYear();
    if (y < 2020 || y > 2035) return null;
    return n;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00+07:00");
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    const hh = (m[4] || "00").padStart(2, "0");
    const mi = (m[5] || "00").padStart(2, "0");
    const ss = (m[6] || "00").padStart(2, "0");
    if (Number(yyyy) < 2020 || Number(yyyy) > 2035) return null;
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}+07:00`);
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  if (y < 2020 || y > 2035) return null;
  return d.getTime();
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

export const kunciHari = (ts) => {
  if (ts == null) return "tanpa-tanggal";
  const key = fmtHari.format(ts);
  if (!/^(20[2-3]\d)-\d{2}-\d{2}$/.test(key)) return "tanpa-tanggal";
  return key;
};
export const jamWIB = (ts) => {
  if (ts == null) return "--.--";
  const jam = fmtJam.format(ts);
  if (jam === "00.00" || jam === "00:00") return "--.--";
  return `${jam} WIB`;
};

export function normTx(r, sumber = "lokal") {
  const items = normItems(r);
  let totalQty = 0;
  for (let i = 0; i < items.length; i++) totalQty += items[i].qty;
  const tipe = normTipe(r.type ?? r.tipe ?? r.jenis ?? r.action);
  const entitas = normEntitas(r.entity ?? r.entitas ?? r.divisi);
  const ts = parseWaktu(
    r.savedAt ?? r.at ?? r.timestamp ?? r.createdAt ?? r.updatedAt ?? r.processingStartedAt ?? r.tanggal ?? r.date
  );
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
  if (!key || key === "tanpa-tanggal") return "Tanpa tanggal";
  if (!/^(20[2-3]\d)-\d{2}-\d{2}$/.test(key)) return "Tanpa tanggal";
  if (key === kunciHari(now)) return "Hari ini";
  if (key === kunciHari(now - 86400000)) return "Kemarin";
  try {
    return fmtTanggal.format(new Date(`${key}T12:00:00+07:00`)).toUpperCase();
  } catch {
    return "Tanpa tanggal";
  }
}

export function filterTx(list, { tipe = "semua", entitas = "semua", status = "semua", q = "" } = {}) {
  const qn = String(q || "").trim().toLowerCase();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (tipe !== "semua" && t.tipe !== tipe) continue;
    if (entitas !== "semua" && t.entitas !== entitas) continue;
    if (status !== "semua" && t.status !== status) continue;
    if (qn && !(t._hay || "").includes(qn)) continue;
    out.push(t);
  }
  return out;
}

export function kelompokkan(list, now = Date.now()) {
  const map = new Map();
  const anomali = [];
  let totalValid = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.anomali) {
      anomali.push(t);
      continue;
    }
    totalValid += 1;
    const k = t.hariKey || kunciHari(t.ts);
    let g = map.get(k);
    if (!g) {
      g = { key: k, label: labelHari(k, now), items: [], ringkas: { masuk: 0, keluar: 0, rusak: 0 } };
      map.set(k, g);
    }
    g.items.push(t);
    if (t.tipe && g.ringkas[t.tipe] != null) g.ringkas[t.tipe] += t.totalQty || 0;
  }
  const hari = Array.from(map.values()).sort((a, b) => (b.key > a.key ? 1 : -1));
  return { hari, anomali, totalValid };
}

export function hitungStatus(list) {
  const status = { semua: 0, terkirim: 0, antrian: 0, gagal: 0, lokal: 0 };
  for (let i = 0; i < list.length; i++) {
    const s = list[i].status;
    status.semua += 1;
    if (status[s] != null) status[s] += 1;
  }
  return status;
}

export function ringkasKatalog(list) {
  const status = { semua: 0, terkirim: 0, antrian: 0, gagal: 0, lokal: 0 };
  const tipe = { masuk: 0, keluar: 0, rusak: 0 };
  let anomali = 0;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (t.anomali) {
      anomali += 1;
      continue;
    }
    status.semua += 1;
    if (status[t.status] != null) status[t.status] += 1;
    if (tipe[t.tipe] != null) tipe[t.tipe] += 1;
  }
  return { status, tipe, anomali };
}

export function keCSV(list) {
  const kepala = ["Tanggal", "Jam", "Tipe", "Entitas", "Kode", "Nama", "Qty", "Satuan", "Status", "Keterangan", "Sumber"];
  const rows = [kepala.join(",")];
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    for (let j = 0; j < (t.items || []).length; j++) {
      const it = t.items[j];
      rows.push([
        t.hariKey || kunciHari(t.ts),
        t.jamLabel || jamWIB(t.ts),
        t.tipe || "",
        t.entitas || "",
        it.kode || "",
        (it.nama || "").replace(/,/g, " "),
        it.qty,
        it.satuan || "",
        t.status || "",
        (t.keterangan || "").replace(/,/g, " "),
        t.sumber || "",
      ].join(","));
    }
  }
  return rows.join("\n");
}

export function ringkasanTeks(t) {
  const lines = [`${t.tipe || "?"} · ${t.entitas || "?"} · ${t.jamLabel || ""}`];
  for (let i = 0; i < (t.items || []).length; i++) {
    const it = t.items[i];
    lines.push(`- ${it.nama || it.kode}: ${it.qty} ${it.satuan || ""}`);
  }
  if (t.keterangan) lines.push(`Ket: ${t.keterangan}`);
  return lines.join("\n");
}
