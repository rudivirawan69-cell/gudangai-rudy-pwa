 /**
 * Voice Input — Web Speech API wrapper for Indonesian voice input
 */

export function isSpeechSupported() {
  if (typeof window === 'undefined') return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/** Create a speech recognizer instance */
export function createRecognizer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return null;
  const r = new SR();
  r.lang = 'id-ID';
  r.interimResults = false;
  r.maxAlternatives = 1;
  return r;
}

/** Parse voice transcript into structured command */
export function parseVoiceCommand(transcript) {
  if (!transcript) return null;
  const text = transcript.toLowerCase().trim();
  let type = null, cleanText = text;
  if (/\bmasuk\b/.test(text)) { type = 'masuk'; cleanText = text.replace(/\bmasuk\b/, '').trim(); }
  else if (/\bkeluar\b/.test(text)) { type = 'keluar'; cleanText = text.replace(/\bkeluar\b/, '').trim(); }
  else if (/\brusak\b/.test(text)) { type = 'rusak'; cleanText = text.replace(/\brusak\b/, '').trim(); }
  let qty = null;
  const numMatch = cleanText.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (numMatch) { qty = parseFloat(numMatch[1].replace(',', '.')); cleanText = cleanText.replace(numMatch[0], '').trim(); }
  let satuan = null;
  for (const s of ['pack', 'pcs', 'kg', 'kilogram', 'ekor', 'box', 'pail', 'unit', 'liter']) {
    if (cleanText.includes(s)) { satuan = s === 'kilogram' ? 'Kg' : s.charAt(0).toUpperCase() + s.slice(1); cleanText = cleanText.replace(new RegExp(`\\b${s}\\b`, 'g'), '').trim(); break; }
  }
  return { nameQuery: cleanText.replace(/\s+/g, ' ').trim(), qty, type, satuan, raw: transcript };
}

/** Resolve voice item name to master data item */
export function resolveVoiceItem(nameQuery, entity, searchMasterFn) {
  if (!nameQuery) return null;
  const results = searchMasterFn(entity, nameQuery);
  if (results.length === 1) return { item: results[0], exact: true };
  if (results.length > 1) return { item: results[0], exact: false, candidates: results.slice(0, 5) };
  return null;
}
