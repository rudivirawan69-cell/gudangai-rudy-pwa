import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'artifacts/ui-audit');
fs.mkdirSync(OUT, { recursive: true });
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const walk = (dir, ext) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
  const p = path.posix.join(dir, e.name);
  return e.isDirectory() ? walk(p, ext) : ext.some((x) => p.endsWith(x)) ? [p] : [];
});
const cssFiles = walk('src', ['.css']).sort();
const jsxFiles = walk('src', ['.jsx']);
const css = cssFiles.map((file) => [file, read(file)]);
const jsx = jsxFiles.map(read).join('\n');
const imports = (s) => [...s.matchAll(/@import\s+(?:url\()?["']([^"']+)["']\)?\s*;/g)].map((m) => m[1]);
function graph(file, seen = new Set()) {
  if (seen.has(file) || !fs.existsSync(path.join(ROOT, file))) return [];
  seen.add(file);
  const deps = imports(read(file));
  return [{ file, imports: deps }, ...deps.flatMap((d) => graph(path.posix.normalize(path.posix.join(path.posix.dirname(file), d)), seen))];
}
const mainImports = [...read('src/main.jsx').matchAll(/import\s+["']([^"']+\.css)["']/g)].map((m) => m[1]);
const graphFiles = graph('src/css-theme-imports.css');
const selectorMap = new Map();
for (const [file, source] of css) {
  for (const block of source.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const head = block[1].trim();
    if (!head || head.startsWith('@')) continue;
    for (const s of head.split(',')) {
      const selector = s.trim();
      if (!selector) continue;
      if (!selectorMap.has(selector)) selectorMap.set(selector, []);
      selectorMap.get(selector).push(file);
    }
  }
}
const duplicates = [...selectorMap].filter(([, files]) => files.length > 1).map(([selector, files]) => ({ selector, count: files.length, files }));
const unusedCandidates = [...selectorMap].flatMap(([selector, files]) => {
  const atoms = [...selector.matchAll(/\.([_a-zA-Z][\w-]*)|#([_a-zA-Z][\w-]*)/g)].map((m) => m[1] || m[2]);
  return atoms.length && atoms.every((name) => !jsx.includes(name)) ? [{ selector, files }] : [];
});
const counts = css.filter(([f]) => f !== 'src/theme-tokens.css').map(([file, s]) => ({
  file, hex: (s.match(/#[\da-f]{3,8}\b/gi) || []).length,
  hsl: (s.match(/\bhsla?\(/gi) || []).length,
  important: (s.match(/!important\b/g) || []).length,
}));
const totals = counts.reduce((a, x) => ({ hex: a.hex + x.hex, hsl: a.hsl + x.hsl, important: a.important + x.important }), { hex: 0, hsl: 0, important: 0 });
const html = read('index.html');
const inventory = {
  cssFiles, cssCount: cssFiles.length, jsxCount: jsxFiles.length, mainImports,
  themeImportGraph: graphFiles,
  unimportedCssCandidates: cssFiles.filter((f) => !graphFiles.some((x) => x.file === f) && !mainImports.some((i) => path.posix.normalize(path.posix.join('src', i)) === f)),
  duplicateSelectors: duplicates, selectorsWithoutLiteralJsxToken: unusedCandidates,
  hardcodedOutsideTokens: { totals, files: counts },
  htmlThemeBootstrap: {
    setsDataTheme: /root\.dataset\.theme\s*=/.test(html),
    readsStoredTheme: /localStorage\.getItem\(['"]gudangai_theme['"]\)/.test(html),
    updatesThemeColor: /meta\.setAttribute\(['"]content['"]/.test(html),
    disablesZoom: /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(html),
  },
};
fs.writeFileSync(path.join(OUT, 'inventory.json'), JSON.stringify(inventory, null, 2));
const md = [
  '# UI inventory',
  '',
  '## Import CSS dari main.jsx',
  ...mainImports.map((x, i) => String(i + 1) + '. ' + x),
  '',
  '## CSS terhubung melalui css-theme-imports.css',
  ...graphFiles.map((x) => '- ' + x.file + ' -> ' + x.imports.join(', ')),
  '',
  '## Kandidat CSS tidak terhubung',
  ...(inventory.unimportedCssCandidates.length ? inventory.unimportedCssCandidates.map((x) => '- ' + x) : ['- Tidak ada']),
  '',
  '## Selektor duplikat: ' + duplicates.length,
  ...duplicates.map((x) => '- ' + x.selector + ' × ' + x.count + ': ' + x.files.join(', ')),
  '',
  '## Kandidat selektor tanpa token literal JSX: ' + unusedCandidates.length,
  ...unusedCandidates.map((x) => '- ' + x.selector + ': ' + x.files.join(', ')),
  '',
  '## Hitungan di luar theme-tokens.css',
  '- #hex: ' + totals.hex, '- hsl()/hsla(): ' + totals.hsl, '- !important: ' + totals.important,
  '',
  '| File | #hex | hsl | !important |', '|---|---:|---:|---:|',
  ...counts.map((x) => '| ' + x.file + ' | ' + x.hex + ' | ' + x.hsl + ' | ' + x.important + ' |'),
].join('\n') + '\n';
fs.writeFileSync(path.join(OUT, 'inventory.md'), md);

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
let previewReady = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:4173/');
    if (response.ok) { previewReady = true; break; }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!previewReady) { server.kill('SIGTERM'); throw new Error('Vite preview tidak siap dalam 30 detik'); }
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 412, height: 850 } });
await context.route('**/*', (route) => {
  const u = new URL(route.request().url());
  return ['127.0.0.1', 'localhost'].includes(u.hostname) ? route.continue() : route.abort();
});
await context.addInitScript(() => { try { localStorage.setItem('gudangai_theme', new URL(location.href).searchParams.get('theme') || 'soft_light'); } catch {} });
const page = await context.newPage();
const themes = ['soft_light', 'deep_ocean', 'graphite_titanium'];
const widths = [360, 412, 768, 1024];
const shots = [], contrastRows = [], axeRows = [];
const parse = (v) => {
  const m = v.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = v.match(/^#([\da-f]{3,8})$/i); if (!h) return null;
  let x = h[1]; if (x.length === 3 || x.length === 4) x = x.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};
const lum = (c) => c.reduce((sum, v, i) => sum + [0.2126,0.7152,0.0722][i] * ((v/255 <= .04045) ? v/255/12.92 : ((v/255+.055)/1.055)**2.4), 0);
const ratio = (a,b) => { if (!a || !b) return null; const x=lum(a), y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
try {
  const res = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  if (!res || !res.ok()) throw new Error('Vite preview tidak merespons HTTP OK');
  await page.waitForTimeout(1800);
  for (const theme of themes) {
    await page.evaluate((t) => { document.documentElement.dataset.theme=t; localStorage.setItem('gudangai_theme',t); }, theme);
    await page.waitForTimeout(120);
    const tokens = await page.evaluate(() => {
      const s=getComputedStyle(document.documentElement);
      return Object.fromEntries(['--page-bg','--bg-app','--bg-elevated','--text-main','--text-muted','--text-on-bg','--text-on-accent','--accent-strong'].map((k)=>[k,s.getPropertyValue(k).trim()]));
    });
    const pairs = [['--text-main','--bg-elevated',7],['--text-muted','--bg-elevated',4.5],['--text-main','--bg-app',7],['--text-muted','--bg-app',4.5],['--text-on-accent','--accent-strong',4.5],['--text-on-bg','--page-bg',7]];
    for (const [fg,bg,min] of pairs) {
      const value=ratio(parse(tokens[fg]),parse(tokens[bg]));
      contrastRows.push({theme,fg,bg,foreground:tokens[fg]||null,background:tokens[bg]||null,ratio:value===null?null:Number(value.toFixed(2)),minimum:min,result:value===null?'MISSING':value>=min?'PASS':'FAIL'});
    }
    for (const width of widths) {
      await page.setViewportSize({width,height:850});
      const info=await page.evaluate(()=>({dataTheme:document.documentElement.dataset.theme,scrollWidth:document.documentElement.scrollWidth,innerWidth,loginVisible:!!document.querySelector('form input[type="email"],form input[autocomplete="username"],input[type="password"]'),text:(document.body.innerText||'').slice(0,1200)}));
      const file='login-'+theme+'-'+width+'.png';
      await page.screenshot({path:path.join(OUT,file),fullPage:true});
      shots.push({theme,width,file,...info,overflow:info.scrollWidth>info.innerWidth});
    }
    await page.setViewportSize({width:412,height:850});
    await page.addScriptTag({path:path.join(ROOT,'node_modules/axe-core/axe.min.js')});
    const axe=await page.evaluate(async()=>{const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});return r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,description:v.description}));});
    axeRows.push({theme,violations:axe});
  }
} finally {
  await context.close(); await browser.close(); server.kill('SIGTERM');
}
const summary={screenshots:shots,contrast:contrastRows,axe:axeRows};
for (const [name,data] of Object.entries(summary)) fs.writeFileSync(path.join(OUT,name+'.json'),JSON.stringify(data,null,2));
const fails=contrastRows.filter((x)=>x.result!=='PASS');
const overflow=shots.filter((x)=>x.overflow);
const violations=axeRows.flatMap((x)=>x.violations.map((v)=>({theme:x.theme,...v})));
fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify({screenshotCount:shots.length,overflowCount:overflow.length,contrastFailureCount:fails.length,contrastFailures:fails,axeViolations:violations},null,2));
console.log(JSON.stringify({cssFiles:cssFiles.length,jsxFiles:jsxFiles.length,screenshots:shots.length,overflow:overflow.length,contrastFailures:fails.length,axeViolations:violations.length},null,2));
if (overflow.length || fails.length || violations.length) process.exitCode=1;
