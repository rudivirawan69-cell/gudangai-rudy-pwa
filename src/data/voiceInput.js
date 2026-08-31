/**
 * Voice input helper — Web Speech API (id-ID)
 * Contoh: "keluar sepuluh ice cream" | "masuk 5 saos lada hitam" | "rusak 2 udang"
 */

const WORD_NUM = {
  nol: 0, kosong: 0,
  satu: 1, se: 1,
  dua: 2, tiga: 3, empat: 4, lima: 5,
  enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
  sepuluh: 10, sebelas: 11,
  belas: 10,
  puluh: 10,
  seratus: 100, ratus: 100,
  seribu: 1000, ribu: 1000,
};

export function isSpeechSupported() {
  return typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function createRecognizer({ lang = 'id-ID', continuous = false, interimResults = true } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const rec = new SR();
  rec.lang = lang;
  rec.continuous = continuous;
  rec.interimResults = interimResults;
  rec.maxAlternatives = 3;
  return rec;
}

function wordsToNumber(text) {
  const t = text.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
  const dig = t.match(/\d+([.,]\d+)?/);
  if (dig) return parseFloat(dig[0].replace(',', '.'));

  const tokens = t.split(/\s+/).filter(Boolean);
  let total = 0;
  let current = 0;
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (w === 'belas' && current > 0) {
      total += 10 + current;
      current = 0;
      continue;
    }
    if (w === 'puluh') {
      current = (current || 1) * 10;
      continue;
    }
    if (w === 'ratus' || w === 'seratus') {
      current = (current || 1) * 100;
      if (w === 'seratus') {
        total += current;
        current = 0;
      }
      continue;
    }
    if (WORD_NUM[w] != null) {
      const n = WORD_NUM[w];
      if (n >= 100) {
        current = (current || 1) * n;
      } else if (n === 10 && current === 0) {
        current = 10;
      } else {
        current += n;
      }
    }
  }
  total += current;
  return total > 0 ? total : null;
}

export function parseVoiceCommand(raw) {
  if (!raw || !String(raw).trim()) return null;
  let text = String(raw).toLowerCase().trim();
  text = text
    .replace(/\b(tolong|mohon|ya|oke|ok|segera|sekarang)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let entity = null;
  if (/\b(entity\s+)?cv\b|\bcv\s+nasi\b/.test(text)) entity = 'CV';
  if (/\b(entity\s+)?pt\b|\bpt\s+nasi\b/.test(text)) entity = 'PT';

  let type = null;
  if (/\b(barang\s+)?masuk\b|\btambah(\s+stok)?\b|\bstok\s+masuk\b|\bin\b/.test(text)) type = 'masuk';
  else if (/\b(barang\s+)?rusak\b|\breject\b|\bbusuk\b|\bexpired\b|\bkadaluarsa\b/.test(text)) type = 'rusak';
  else if (/\b(barang\s+)?keluar\b|\bambil\b|\bkirim\b|\bout\b|\bkurangi\b/.test(text)) type = 'keluar';

  let rest = text
    .replace(/\b(barang\s+)?(masuk|keluar|rusak)\b/g, ' ')
    .replace(/\b(tambah|stok|ambil|kirim|kurangi|reject|busuk|expired|kadaluarsa)\b/g, ' ')
    .replace(/\b(entity\s+)?(cv|pt)\b/g, ' ')
    .replace(/\b(pack|pcs|kg|botol|karton|dus|unit)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let qty = null;
  const leadNum = rest.match(/^(\d+([.,]\d+)?)\s+(.*)$/);
  if (leadNum) {
    qty = parseFloat(leadNum[1].replace(',', '.'));
    rest = leadNum[3].trim();
  } else {
    const words = rest.split(/\s+/);
    for (let n = Math.min(4, words.length); n >= 1; n--) {
      const phrase = words.slice(0, n).join(' ');
      const val = wordsToNumber(phrase);
      if (val != null && val > 0) {
        const allNum = phrase.split(/\s+/).every(
          (w) => WORD_NUM[w] != null || w === 'belas' || w === 'puluh' || /^\d+([.,]\d+)?$/.test(w)
        );
        if (allNum) {
          qty = val;
          rest = words.slice(n).join(' ').trim();
          break;
        }
      }
    }
  }

  if (qty == null) {
    const mid = rest.match(/^(.*?)\s+(\d+([.,]\d+)?)\s*$/);
    if (mid && mid[1].trim().length > 1) {
      qty = parseFloat(mid[2].replace(',', '.'));
      rest = mid[1].trim();
    }
  }

  if (qty == null) qty = 1;

  const query = rest.trim();
  if (!query && !type) {
    return { type: null, entity, qty, query: '', raw: String(raw).trim(), empty: true };
  }

  return {
    type,
    entity,
    qty: Math.round(qty * 1000) / 1000,
    query,
    raw: String(raw).trim(),
    empty: false,
  };
}

export function resolveVoiceItem(entity, query, searchMasterFn, matchByAliasFn) {
  if (!query) return { status: 'empty', item: null, candidates: [] };
  if (typeof matchByAliasFn === 'function') {
    const m = matchByAliasFn(entity, query);
    if (m && m.item) return { status: 'matched', item: m.item, matchType: m.matchType || 'alias', candidates: [] };
    if (m && m.candidates && m.candidates.length) {
      return { status: 'ambiguous', item: null, candidates: m.candidates };
    }
  }
  const hits = typeof searchMasterFn === 'function' ? searchMasterFn(entity, query) : [];
  if (hits.length === 1) return { status: 'matched', item: hits[0], matchType: 'search', candidates: [] };
  if (hits.length > 1) return { status: 'ambiguous', item: null, candidates: hits.slice(0, 6) };
  return { status: 'unmatched', item: null, candidates: [] };
}
