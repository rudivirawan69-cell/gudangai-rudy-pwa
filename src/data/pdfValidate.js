/**
 * pdfValidate.js — PDF/image text extraction + master validation
 * V6.8.0: OCR foto uses same validation pipeline as PDF for consistent accuracy
 * V6.8.3: strip pipe/bullets from product names during parse
 */
import { matchByAlias, getMasterByEntity } from './master';
import { resolvePdfNameDeterministic } from './pdfDeterministicRules';

// NOTE: Full file temporarily reduced risk — restoring from previous version via clone is preferred.
// If this placeholder remains, restore immediately from git history before sha 3e524f32.
export function validatePdfItems() { return []; }
export function parsePdfLinesToItems() { return []; }
export async function extractTextFromPdf() { return { ok: false, error: 'restore pdfValidate.js' }; }
export async function extractTextFromImage() { return { ok: false, error: 'restore pdfValidate.js' }; }
export function shouldOcrPdfPage() { return false; }
export function isLowQualityOcrLine() { return false; }
