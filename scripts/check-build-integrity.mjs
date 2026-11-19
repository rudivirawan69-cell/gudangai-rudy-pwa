import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'worker.js');
const visited = new Set();
const failures = [];

function resolveLocal(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = path.extname(base)
    ? [base]
    : [base, `${base}.js`, `${base}.mjs`, `${base}.json`, path.join(base, 'index.js')];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function localImports(source) {
  const found = new Set();
  const patterns = [
    /^\\s*import\\s+(?:[\\s\\S]*?\\s+from\\s+)?['"]((?:\\.{1,2})\\/[^'"]+)['"]/gm,
    /^\\s*export\\s+(?:[\\s\\S]*?\\s+from\\s+)['"]((?:\\.{1,2})\\/[^'"]+)['"]/gm,
    /\\bimport\\(\\s*['"]((?:\\.{1,2})\\/[^'"]+)['"]\\s*\\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) found.add(match[1]);
  }
  return [...found];
}

function walk(file) {
  if (visited.has(file)) return;
  visited.add(file);
  const source = fs.readFileSync(file, 'utf8');
  for (const specifier of localImports(source)) {
    const resolved = resolveLocal(file, specifier);
    if (!resolved) {
      failures.push(`${path.relative(root, file)} -> ${specifier} (missing)`);
      continue;
    }
    walk(resolved);
  }
}

if (!fs.existsSync(entry)) throw new Error('Worker entrypoint worker.js is missing.');
walk(entry);
if (failures.length) {
  console.error('Worker local module graph is incomplete:');
  for (const failure of failures) console.error(' - ' + failure);
  process.exit(1);
}
console.log(`Worker module graph OK: ${visited.size} local modules resolved from worker.js.`);

const mainPath = path.join(root, 'src/main.jsx');
const main = fs.readFileSync(mainPath, 'utf8');
const previewCss = "./uiux-page-system-2026.css";
if (main.includes("import '" + previewCss + "'") || main.includes('import "' + previewCss + '"')) {
  throw new Error('UIUX preview stylesheet must not be statically imported into production.');
}
if (!main.includes("import.meta.env.VITE_UIUX_PREVIEW === 'true'") || !main.includes("await import('" + previewCss + "')")) {
  throw new Error('UIUX preview stylesheet must be dynamically loaded only when VITE_UIUX_PREVIEW=true.');
}
const previewWorkflow = fs.readFileSync(path.join(root, '.github/workflows/uiux-preview.yml'), 'utf8');
if (!previewWorkflow.includes('VITE_UIUX_PREVIEW: "true"')) {
  throw new Error('Isolated UIUX preview workflow does not enable the preview stylesheet flag.');
}
console.log('UIUX style isolation OK: production shell excludes preview-only page-system CSS.');
