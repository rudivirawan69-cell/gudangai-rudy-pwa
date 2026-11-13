/**
 * Modul tanggal & angka Indonesia (WIB) — murni, tanpa dependensi.
 * Digunakan oleh Worker GudangAI RUDY dan boleh disalin ke PWA.
 * Zona waktu: Asia/Jakarta (WIB, UTC+7). Minggu ISO: Senin–Minggu.
 */

const BULAN_ID = {
  jan: 1, january: 1, januari: 1,
  feb: 2, february: 2, februari: 2,
  mar: 3, march: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  agu: 8, aug: 8, august: 8, agustus: 8,
  sep: 9, september: 9,
  okt: 10, oct: 10, october: 10, oktober: 10,
  nov: 11, november: 11,
  des: 12, dec: 12, december: 12, desember: 12,
};

const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** Offset WIB dalam ms */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Ambil komponen tanggal di zona WIB dari Date atau ISO string.
 * Menghindari geser hari di sekitar 00:00–06:59 WIB.
 */
function partsWIB(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  // Gunakan UTC + offset agar konsisten di semua runtime
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const wib = new Date(utc + WIB_OFFSET_MS);
  return {
    y: wib.getUTCFullYear(),
    m: wib.getUTCMonth() + 1,
    d: wib.getUTCDate(),
    h: wib.getUTCHours(),
    min: wib.getUTCMinutes(),
    s: wib.getUTCSeconds(),
    day: wib.getUTCDay(), // 0=Minggu
  };
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Parse berbagai format tanggal sheet/PWA → ISO YYYY-MM-DD (WIB).
 * Menerima: 9-Nov-2026, 2026-11-09, 09/11/2026 (dd/mm), serial Sheets, Date.
 */
export function parseTanggal(input) {
  if (input == null || input === '') return null;
  if (input instanceof Date) {
    const p = partsWIB(input);
    return p ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : null;
  }
  if (typeof input === 'number' && Number.isFinite(input)) {
    // Serial tanggal Google Sheets (hari sejak 1899-12-30)
    // 1 = 1899-12-31, 25569 ≈ 1970-01-01
    const ms = Math.round((input - 25569) * 86400 * 1000);
    const p = partsWIB(new Date(ms));
    return p ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : null;
  }
  const s = String(input).trim();
  if (!s) return null;

  // ISO murni YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }

  // 9-Nov-2026 / 9 Nov 2026 / 09/Nov/2026
  m = s.match(/^(\d{1,2})[-\s\/]+([A-Za-zÀ-ÿ]+)[-\s\/]+(\d{4})$/);
  if (m) {
    const d = +m[1];
    const mo = BULAN_ID[m[2].toLowerCase()];
    const y = +m[3];
    if (mo && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }

  // dd/mm/yyyy atau dd-mm-yyyy (prioritas Indonesia)
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const a = +m[1], b = +m[2], y = +m[3];
    // Asumsi dd/mm jika a > 12 atau b <= 12
    let d, mo;
    if (a > 12) { d = a; mo = b; }
    else if (b > 12) { d = b; mo = a; }
    else { d = a; mo = b; } // default dd/mm
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad2(mo)}-${pad2(d)}`;
  }

  // Fallback Date parse
  const dt = new Date(s);
  if (!Number.isNaN(dt.getTime())) {
    const p = partsWIB(dt);
    return p ? `${p.y}-${pad2(p.m)}-${pad2(p.d)}` : null;
  }
  return null;
}

/** Format ISO → "9 Nov 2026" */
export function formatTanggal(iso) {
  const p = partsWIB(iso + (String(iso).includes('T') ? '' : 'T12:00:00+07:00'));
  if (!p) return String(iso || '');
  return `${p.d} ${NAMA_BULAN[p.m - 1]} ${p.y}`;
}

/** Format ISO → "Senin, 9 Nov 2026" */
export function formatTanggalHari(iso) {
  const p = partsWIB(iso + (String(iso).includes('T') ? '' : 'T12:00:00+07:00'));
  if (!p) return String(iso || '');
  return `${NAMA_HARI[p.day]}, ${p.d} ${NAMA_BULAN[p.m - 1]} ${p.y}`;
}

/** Rentang: "9–15 Nov 2026" atau "28 Okt–3 Nov 2026" */
export function formatRentang(fromIso, toIso) {
  const a = partsWIB(fromIso + 'T12:00:00+07:00');
  const b = partsWIB(toIso + 'T12:00:00+07:00');
  if (!a || !b) return `${fromIso}–${toIso}`;
  if (a.y === b.y && a.m === b.m) {
    return `${a.d}–${b.d} ${NAMA_BULAN[a.m - 1]} ${a.y}`;
  }
  if (a.y === b.y) {
    return `${a.d} ${NAMA_BULAN[a.m - 1]}–${b.d} ${NAMA_BULAN[b.m - 1]} ${a.y}`;
  }
  return `${a.d} ${NAMA_BULAN[a.m - 1]} ${a.y}–${b.d} ${NAMA_BULAN[b.m - 1]} ${b.y}`;
}

/** "11 Nov 2026, 17.07 WIB" */
export function formatWaktuSinkron(date = new Date()) {
  const p = partsWIB(date);
  if (!p) return '';
  return `${p.d} ${NAMA_BULAN[p.m - 1]} ${p.y}, ${pad2(p.h)}.${pad2(p.min)} WIB`;
}

/**
 * Minggu ISO (Senin = awal minggu).
 * Mengembalikan { minggu, from, to, label }.
 */
export function mingguISO(iso) {
  const p = partsWIB(iso + 'T12:00:00+07:00');
  if (!p) return null;
  // Hitung hari Senin minggu ini (WIB)
  const day = p.day; // 0=Minggu
  const offsetToMon = day === 0 ? -6 : 1 - day;
  const monMs = Date.UTC(p.y, p.m - 1, p.d + offsetToMon) - WIB_OFFSET_MS + 12 * 3600_000;
  const sunMs = monMs + 6 * 86400_000;
  const from = parseTanggal(new Date(monMs));
  const to = parseTanggal(new Date(sunMs));
  // Nomor minggu ISO sederhana
  const jan4 = new Date(Date.UTC(p.y, 0, 4));
  const jan4Wib = partsWIB(jan4);
  const startYear = Date.UTC(jan4Wib.y, 0, 4 - ((jan4Wib.day + 6) % 7));
  const weekNo = Math.floor((Date.UTC(p.y, p.m - 1, p.d) - startYear) / 604800000) + 1;
  return {
    minggu: weekNo > 0 ? weekNo : 1,
    from,
    to,
    label: formatRentang(from, to),
  };
}

/** Parse angka Indonesia: "1.163" → 1163, "39,4%" → 39.4 */
export function parseAngkaID(input) {
  if (input == null) return 0;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  let s = String(input).trim().replace(/%/g, '').replace(/\s/g, '');
  if (!s) return 0;
  // Hapus titik ribuan, ganti koma desimal
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Pembulatan sisa terbesar agar total tepat 100.0 (1 desimal).
 * @param {number[]} values - nilai absolut (bukan persen)
 * @param {number} decimals - default 1
 */
export function bulatkanSisaTerbesar(values, decimals = 1) {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const factor = 10 ** decimals;
  // Kerja di integer (cent) agar total tepat
  const rawCents = values.map((v) => (v / total) * 100 * factor);
  const flooredCents = rawCents.map((v) => Math.floor(v + 1e-9));
  let sisa = Math.round(100 * factor - flooredCents.reduce((a, b) => a + b, 0));
  const order = rawCents
    .map((v, i) => ({ i, frac: v - Math.floor(v + 1e-9) }))
    .sort((a, b) => b.frac - a.frac);
  const cents = [...flooredCents];
  for (let k = 0; k < order.length && sisa > 0; k++) {
    cents[order[k].i] += 1;
    sisa--;
  }
  return cents.map((c) => c / factor);
}

/** Hitung umur hari (WIB) dari tanggal ISO ke hari ini (atau acuan). */
export function umurHari(tanggalIso, acuan = new Date()) {
  const a = parseTanggal(tanggalIso);
  const b = parseTanggal(acuan);
  if (!a || !b) return 0;
  const da = new Date(a + 'T00:00:00+07:00').getTime();
  const db = new Date(b + 'T00:00:00+07:00').getTime();
  return Math.max(0, Math.floor((db - da) / 86400000));
}

/** Resolve periode dari query: minggu-ini | minggu-lalu | bulan-ini | from/to */
export function resolvePeriode({ from, to, periode }, sekarang = new Date()) {
  const today = parseTanggal(sekarang);
  if (from && to) {
    const f = parseTanggal(from);
    const t = parseTanggal(to);
    if (!f || !t) return { error: 'Format tanggal from/to tidak valid. Gunakan YYYY-MM-DD.' };
    if (f > t) return { error: 'from tidak boleh lebih besar dari to.' };
    const m = mingguISO(f);
    return { from: f, to: t, minggu: m?.minggu ?? null, label: formatRentang(f, t) };
  }
  const p = String(periode || 'minggu-ini').toLowerCase().replace(/\s+/g, '-');
  if (p === 'minggu-ini' || p === 'mingguini' || p === 'this-week') {
    const m = mingguISO(today);
    return { from: m.from, to: m.to, minggu: m.minggu, label: m.label };
  }
  if (p === 'minggu-lalu' || p === 'minggulalu' || p === 'last-week') {
    const m = mingguISO(today);
    const prevFrom = parseTanggal(new Date(new Date(m.from + 'T12:00:00+07:00').getTime() - 7 * 86400000));
    const prev = mingguISO(prevFrom);
    return { from: prev.from, to: prev.to, minggu: prev.minggu, label: prev.label };
  }
  if (p === 'bulan-ini' || p === 'bulanini' || p === 'this-month') {
    const pt = partsWIB(sekarang);
    const from = `${pt.y}-${pad2(pt.m)}-01`;
    const last = new Date(Date.UTC(pt.y, pt.m, 0)); // hari terakhir bulan
    const to = parseTanggal(last);
    return { from, to, minggu: null, label: formatRentang(from, to) };
  }
  return { error: `Periode tidak dikenal: ${periode}. Gunakan minggu-ini, minggu-lalu, bulan-ini, atau from & to.` };
}

export default {
  parseTanggal,
  formatTanggal,
  formatTanggalHari,
  formatRentang,
  formatWaktuSinkron,
  mingguISO,
  parseAngkaID,
  bulatkanSisaTerbesar,
  umurHari,
  resolvePeriode,
};
