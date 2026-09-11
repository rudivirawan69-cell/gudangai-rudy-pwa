import fs from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('Usage: node scripts/validate_alias_config.mjs <config.json>');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
if (!Number.isInteger(config.version) || config.version < 1) throw new Error('version must be a positive integer');
if (!config.aliases || typeof config.aliases !== 'object' || Array.isArray(config.aliases)) throw new Error('aliases must be an object');

const normalize = (value) => String(value).toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
for (const entity of ['CV', 'PT']) {
  const entries = config.aliases[entity];
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) throw new Error(`${entity} aliases must be an object`);
  const seen = new Map();
  for (const [code, phrases] of Object.entries(entries)) {
    if (!/^\S+-\d{4}$/.test(code)) throw new Error(`Invalid code: ${entity}/${code}`);
    if (!Array.isArray(phrases) || phrases.some((phrase) => typeof phrase !== 'string' || !phrase.trim())) throw new Error(`Invalid phrases: ${entity}/${code}`);
    for (const phrase of phrases) {
      const key = normalize(phrase);
      const prior = seen.get(key);
      if (prior && prior !== code) throw new Error(`Conflicting normalized phrase in ${entity}: ${phrase} -> ${prior}, ${code}`);
      seen.set(key, code);
    }
  }
}
console.log(`Alias config valid: v${config.version}; CV=${Object.keys(config.aliases.CV).length}; PT=${Object.keys(config.aliases.PT).length}`);
