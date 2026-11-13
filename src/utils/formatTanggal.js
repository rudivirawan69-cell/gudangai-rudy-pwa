/** Helper tanggal tunggal — zona Asia/Jakarta, locale id-ID. */

const BULAN_PEND = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function partsWIB(date) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
    hourCycle: 'h23',
  });
  const bag = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    y: Number(bag.year),
    m: Number(bag.month),
    d: Number(bag.day),
    h: Number(bag.hour),
    min: Number(bag.minute),
  };
}

/** Parse berbagai input sheet/API → Date valid atau null. */
export function parseTanggal(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Serial Google Sheets (hari sejak 1899-12-30)
    if (value > 20000 && value < 80000) {
      const ms = Date.UTC(1899, 11, 30) + Math.round(value) * 86400000;
      return new Date(ms);
    }
    if (value < 1e12) return new Date(value * 1000);
    return new Date(value);
  }
  const s = String(value).trim();
  // YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0));
  // 9-Nov-2026 / 9 Nov 2026 / 9/11/2026 (D/M/Y ID)
  m = s.match(/^(\d{1,2})[\/\-\s]+([A-Za-z]{3}|\d{1,2})[\/\-\s]+(\d{4})/);
  if (m) {
    let month;
    if (/^\d+$/.test(m[2])) month = Number(m[2]) - 1;
    else {
      const key = m[2].slice(0, 3).toLowerCase();
      const map = { jan:0,feb:1,mar:2,apr:3,mei:4,may:4,jun:5,jul:6,agu:7,aug:7,sep:8,okt:9,oct:9,nov:10,des:11,dec:11 };
      month = map[key];
    }
    if (month != null) return new Date(Date.UTC(Number(m[3]), month, Number(m[1]), 12, 0, 0));
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t) : null;
}

/** Format tampilan: mode = 'date' | 'withDay' | 'range' | 'sync' | 'iso' */
export function formatTanggal(value, mode = 'date') {
  const date = parseTanggal(value);
  if (!date) return value == null ? '' : String(value);
  const p = partsWIB(date);
  const mon = BULAN_PEND[p.m - 1] || '';
  if (mode === 'iso') {
    return `${String(p.y).padStart(4, '0')}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
  }
  if (mode === 'sync') {
    return `${p.d} ${mon} ${p.y}, ${String(p.h).padStart(2, '0')}.${String(p.min).padStart(2, '0')} WIB`;
  }
  if (mode === 'withDay') {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' }).format(date);
    const map = { Sun: 'Minggu', Mon: 'Senin', Tue: 'Selasa', Wed: 'Rabu', Thu: 'Kamis', Fri: 'Jumat', Sat: 'Sabtu' };
    return `${map[wd] || wd}, ${p.d} ${mon} ${p.y}`;
  }
  return `${p.d} ${mon} ${p.y}`;
}

/** Format rentang: from–to. */
export function formatRentang(from, to) {
  const a = parseTanggal(from);
  const b = parseTanggal(to);
  if (!a || !b) return [from, to].filter(Boolean).join(' – ');
  const pa = partsWIB(a);
  const pb = partsWIB(b);
  if (pa.y === pb.y && pa.m === pb.m) {
    return `${pa.d}–${pb.d} ${BULAN_PEND[pa.m - 1]} ${pa.y}`;
  }
  if (pa.y === pb.y) {
    return `${pa.d} ${BULAN_PEND[pa.m - 1]} – ${pb.d} ${BULAN_PEND[pb.m - 1]} ${pa.y}`;
  }
  return `${formatTanggal(a)} – ${formatTanggal(b)}`;
}

/** Parse angka sheet teks ID: "1.163" → 1163, "39,4" → 39.4 */
export function parseAngkaID(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s0 = String(value ?? '').trim();
  if (!s0) return 0;
  if (s0.includes(',') && s0.includes('.')) {
    // 1.163,5 → ribuan titik, desimal koma
    return Number(s0.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (s0.includes(',') && !s0.includes('.')) {
    return Number(s0.replace(',', '.')) || 0;
  }
  // "1.163" tanpa desimal → anggap pemisah ribuan
  if (/^\d{1,3}(\.\d{3})+$/.test(s0)) {
    return Number(s0.replace(/\./g, '')) || 0;
  }
  return Number(s0.replace(/[^0-9.-]/g, '')) || 0;
}

/** Pembulatan largest-remainder agar total % = 100. */
export function largestRemainderPercents(values) {
  const nums = values.map((v) => Math.max(0, Number(v) || 0));
  const sum = nums.reduce((a, b) => a + b, 0);
  if (sum <= 0) return nums.map(() => 0);
  const raw = nums.map((v) => (v / sum) * 100);
  const floors = raw.map((v) => Math.floor(v * 10) / 10); // 1 desimal
  let used = floors.reduce((a, b) => a + b, 0);
  const remainders = raw.map((v, i) => ({ i, r: v - floors[i] }));
  remainders.sort((a, b) => b.r - a.r);
  const out = floors.slice();
  let idx = 0;
  while (Math.round((100 - used) * 10) > 0 && idx < remainders.length) {
    out[remainders[idx].i] = Math.round((out[remainders[idx].i] + 0.1) * 10) / 10;
    used = Math.round((used + 0.1) * 10) / 10;
    idx += 1;
  }
  // Koreksi sisa floating
  const drift = Math.round((100 - out.reduce((a, b) => a + b, 0)) * 10) / 10;
  if (drift !== 0 && remainders[0]) out[remainders[0].i] = Math.round((out[remainders[0].i] + drift) * 10) / 10;
  return out;
}

export default formatTanggal;
