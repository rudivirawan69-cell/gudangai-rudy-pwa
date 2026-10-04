import { readFile, writeFile } from 'node:fs/promises';

const path = new URL('../public/sw.js', import.meta.url);
const source = await readFile(path, 'utf8');
const version = process.env.CF_VERSION_METADATA || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || new Date().toISOString();
const next = source.replace(/__GUDANGAI_BUILD_VERSION__/g, version);
if (next === source && !source.includes('__GUDANGAI_BUILD_VERSION__')) {
  throw new Error('Service worker build-version placeholder not found.');
}
await writeFile(path, next, 'utf8');
console.log('[GudangAI PWA] Service Worker version:', version);
