/**
 * pdfValidate.js — PDF/image text extraction + master validation
 * Tuned for REKAP ORDER warehouse PDFs (CV. SELERA BOGATAMA / PT. RASYUKA)
 * + 2-column merge + ambiguity rules (YAKINIKU/LOWFAT only for unresolved)
 * Acuan ketat validasi PDF (12 Sep 2026): strip NO urut, size, outlet noise
 * V6.5.4: deterministic resolver BEFORE alias matching; parenthesis context preserved
 */
import { matchByAlias, getMasterByEntity } from './master';
import { resolvePdfNameDeterministic, normalizeOcr } from './pdfDeterministicRules';

let pdfjsLib = null;
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  try {
    pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
    return pdfjsLib;
  } catch {
    return null;
  }
}
