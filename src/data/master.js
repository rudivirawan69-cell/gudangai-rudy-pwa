// Master data 189 items + Alias-based search
import aliasConfig from './alias-config.json';

const MASTER_CV = [
  {kode:"CV-0001",nama:"Ayam Fillet Dada",satuan:"Kg",divisi:"CS"},{kode:"CV-0002",nama:"Ayam Fillet Paha",satuan:"Kg",divisi:"CS"},
  {kode:"CV-0003",nama:"Udang PND",satuan:"Kg",divisi:"CS"},{kode:"CV-0004",nama:"Bakso Ikan CIDEA (500 GRAM)",satuan:"Pack",divisi:"CS"},
  {kode:"CV-0005",nama:"Cumi Cumi",satuan:"Kg",divisi:"CS"},{kode:"CV-0007",nama:"Bakso Ikan",satuan:"Pack",divisi:"CS"},
  {kode:"CV-0008",nama:"Daging Sapi Slice (YAKINIKU)",satuan:"Pack",divisi:"CS"},{kode:"CV-0009",nama:"Tulang Krongkongan",satuan:"Kg",divisi:"CS"},
  {kode:"CV-0028",nama:"Sosis Vigo",satuan:"Pack",divisi:"CS"},{kode:"CV-0030",nama:"Ice Cream Vanilla",satuan:"Pail",divisi:"CS"},
  {kode:"CV-0032",nama:"Nangka Kupas",satuan:"Kg",divisi:"CS"},{kode:"CV-0033",nama:"Golden Farm Mix",satuan:"Pack",divisi:"CS"},
  {kode:"CV-0061",nama:"Ayam AGM Promo",satuan:"Pack",divisi:"CS"},{kode:"CV-0062",nama:"Es Cream 3 Rasa",satuan:"Pail",divisi:"CS"},
  {kode:"CV-0084",nama:"Daging Slice (LOWFAT)",satuan:"Pack",divisi:"CS"},{kode:"CV-0090",nama:"Sosis Vitalia (420 gram)",satuan:"Pack",divisi:"CS"},
  {kode:"CV-0091",nama:"Sosis PRONAS (500 GRAM)",satuan:"Pack",divisi:"CS"},{kode:"CV-0095",nama:"Cireng (24 pcs)",satuan:"Pack",divisi:"CS"},
  {kode:"CV-0096",nama:"Kulit Lumpia (40 pcs)",satuan:"Pack",divisi:"CS"},{kode:"CV-0097",nama:"Ayam Parting 10 Fresh",satuan:"Ekor",divisi:"CS"},
  {kode:"CV-0098",nama:"Singkong Keju",satuan:"Pack",divisi:"CS"},{kode:"CV-0099",nama:"Degan Frozen (1 kg)",satuan:"Pack",divisi:"CS"},
  {kode:"CV-0011",nama:"Chiken Wing",satuan:"Pack",divisi:"DAPUR 1"},{kode:"CV-0014",nama:"Daging Pangsit",satuan:"Pack",divisi:"DAPUR 1"},
  {kode:"CV-0038",nama:"Tulang Kepala Ceker",satuan:"Kg",divisi:"DAPUR 1"},{kode:"CV-0070",nama:"Ayam Penyet 2 Dada + 2 Paha",satuan:"Pack",divisi:"DAPUR 1"},
  {kode:"CV-0071",nama:"Ayam Negeri 2 Dada + 2 Paha",satuan:"Pack",divisi:"DAPUR 1"},{kode:"CV-0085",nama:"Chiken Katsu (promo 50)",satuan:"Pack",divisi:"DAPUR 1"},
  {kode:"CV-0086",nama:"Chiken Katsu Jumbo",satuan:"Pack",divisi:"DAPUR 1"},
  {kode:"CV-0010",nama:"Nugget",satuan:"Pack",divisi:"DAPUR 2"},{kode:"CV-0034",nama:"Ayam Paha Panggang",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"CV-0037",nama:"Bakso Sapi Halus",satuan:"Pack",divisi:"DAPUR 2"},{kode:"CV-0039",nama:"Nugget Katsu",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"CV-0083",nama:"Tahu Walik Promo",satuan:"Pack",divisi:"DAPUR 2"},{kode:"CV-0080",nama:"Kentang Goreng",satuan:"Pack",divisi:"DAPUR 2"},{kode:"CV-0087",nama:"Chicken Roll",satuan:"Pack",divisi:"DAPUR 2"},{kode:"CV-0088",nama:"Chicken Shrimp Roll",satuan:"Pack",divisi:"DAPUR 2"},{kode:"CV-0089",nama:"Chicken Ball",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"CV-0012",nama:"Mie Goreng",satuan:"Kg",divisi:"MIE"},{kode:"CV-0013",nama:"Mie Rebus",satuan:"Kg",divisi:"MIE"},
  {kode:"CV-0015",nama:"Kulit Pangsit Goreng",satuan:"Pack",divisi:"MIE"},{kode:"CV-0016",nama:"Kulit Pangsit Rebus",satuan:"Pack",divisi:"MIE"},
  {kode:"CV-0074",nama:"Mie Bulat Promo (500 gram)",satuan:"Pack",divisi:"MIE"},
  {kode:"CV-0017",nama:"Bumbu Mie",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0018",nama:"Minyak Mie",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0019",nama:"Saos Masakan",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0020",nama:"Saos Asam Manis",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0021",nama:"Saos Lada Hitam",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0022",nama:"Saos Cah Cabai",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0023",nama:"Bumbu Nasi Goreng Jawa",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0024",nama:"Bumbu Pedas",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0025",nama:"Saos AM Pedas",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0026",nama:"Saos Tom Yum",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0027",nama:"Sambal Produksi",satuan:"Kg",divisi:"PACKING"},{kode:"CV-0029",nama:"Saos Special",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0031",nama:"Sambel Bajak",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0036",nama:"Saos Ayam 69",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0058",nama:"Saos AGM Promo",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0059",nama:"Saos Rica-Rica Promo",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0060",nama:"Saos Kecap Inggris Promo",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0067",nama:"Bumbu Mendoan",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0073",nama:"Bumbu Mie Nyemek PROMO",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0076",nama:"Saos Bakaran",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0077",nama:"Bumbu Urap Urap",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0078",nama:"Sambal Bawang (500 gram)",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0079",nama:"Saos Nasgor Merah (30gr/10pcs)",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0092",nama:"Saos Lada Hitam (PROMO)",satuan:"Pack",divisi:"PACKING"},
  {kode:"CV-0093",nama:"Saos Keju",satuan:"Pack",divisi:"PACKING"},{kode:"CV-0094",nama:"Kacang Merah",satuan:"Kg",divisi:"PACKING"},
  {kode:"BBCV-0001",nama:"Bonelles Dada",satuan:"Kg",divisi:"BAHAN BAKU"},{kode:"BBCV-0002",nama:"Bonelles Paha",satuan:"Kg",divisi:"BAHAN BAKU"},
];

const MASTER_PT = [
  {kode:"PT-0001",nama:"Ayam Fillet Dada",satuan:"Kg",divisi:"CS"},{kode:"PT-0002",nama:"Ayam Fillet Paha",satuan:"Kg",divisi:"CS"},
  {kode:"PT-0003",nama:"Udang PND",satuan:"Kg",divisi:"CS"},{kode:"PT-0005",nama:"Udang PND (115/1kg)",satuan:"Kg",divisi:"CS"},
  {kode:"PT-0006",nama:"Cumi Cumi",satuan:"Kg",divisi:"CS"},{kode:"PT-0007",nama:"Bakso Ikan",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0008",nama:"Daging Sapi Slice (YAKINIKU)",satuan:"Pack",divisi:"CS"},{kode:"PT-0021",nama:"Saos Lada Hitam",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0022",nama:"Saos Masakan",satuan:"Pack",divisi:"PACKING"},{kode:"PT-0023",nama:"Saos Cah Cabai",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0024",nama:"Bumbu Nasi Goreng Jawa",satuan:"Pack",divisi:"PACKING"},{kode:"PT-0025",nama:"Bumbu Pedas",satuan:"Pack",divisi:"PACKING"},
];

function getAliasLookup(entity) {
  const aliases = (aliasConfig && aliasConfig.aliases && aliasConfig.aliases[entity]) || {};
  const lookup = {};
  for (const [kode, list] of Object.entries(aliases)) {
    for (const a of list || []) {
      if (a) lookup[String(a).toLowerCase().trim()] = kode;
    }
  }
  return lookup;
}

export function getMasterByEntity(entity) { return entity === "CV" ? MASTER_CV : MASTER_PT; }
export function getAllMaster() { return { CV: MASTER_CV, PT: MASTER_PT }; }
export function findByKode(kode) { return [...MASTER_CV, ...MASTER_PT].find(i => i.kode === kode); }

export function searchMaster(entity, query) {
  const list = getMasterByEntity(entity);
  if (!query) return list;
  const q = query.toLowerCase().trim();
  const aliasLookup = getAliasLookup(entity);
  const aliasKode = aliasLookup[q];
  if (aliasKode) {
    const item = list.find(i => i.kode === aliasKode);
    if (item) return [item];
  }
  const directMatches = list.filter(i =>
    i.kode.toLowerCase().includes(q) ||
    i.nama.toLowerCase().includes(q) ||
    i.divisi.toLowerCase().includes(q)
  );
  if (directMatches.length > 0) return directMatches;
  const aliasMatches = new Set();
  for (const [alias, kode] of Object.entries(aliasLookup)) {
    if (alias.includes(q)) aliasMatches.add(kode);
  }
  if (aliasMatches.size > 0) return list.filter(i => aliasMatches.has(i.kode));
  return [];
}

export function matchByAlias(entity, name) {
  if (!name) return null;
  const normalized = name.toLowerCase().trim()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*\/\s*cv\.\s*pd3\s*chicken/gi, '')
    .replace(/\s*\/\s*good\s*eat/gi, '')
    .replace(/[-–—]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const lookup = getAliasLookup(entity);
  const list = getMasterByEntity(entity);

  if (lookup[normalized]) {
    const item = list.find(i => i.kode === lookup[normalized]);
    if (item) return { item, matchType: 'alias-exact' };
  }
  const namaMatch = list.find(i => i.nama.toLowerCase() === normalized);
  if (namaMatch) return { item: namaMatch, matchType: 'nama-exact' };

  const aliasHits = [];
  for (const [alias, kode] of Object.entries(lookup)) {
    if (!alias || alias.length < 2) continue;
    if (normalized === alias || normalized.includes(alias) || alias.includes(normalized)) {
      aliasHits.push({ alias, kode, len: alias.length, exact: normalized === alias });
    }
  }
  if (aliasHits.length) {
    aliasHits.sort((a, b) => (b.exact - a.exact) || (b.len - a.len));
    const best = aliasHits[0];
    if (best.len >= 4 || best.exact) {
      const item = list.find(i => i.kode === best.kode);
      if (item) return { item, matchType: best.exact ? 'alias-exact' : 'alias-partial' };
    }
  }

  const namaHits = list
    .map(i => {
      const n = i.nama.toLowerCase();
      if (n === normalized) return { item: i, len: n.length, score: 100 };
      if (normalized.includes(n) || n.includes(normalized)) return { item: i, len: n.length, score: Math.min(n.length, normalized.length) };
      return null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.len - a.len);
  if (namaHits.length) {
    return { item: namaHits[0].item, matchType: 'nama-partial' };
  }
  return null;
}

export const DIVISIONS = ["CS", "MIE", "DAPUR 1", "DAPUR 2", "PACKING", "BAHAN BAKU", "REKANAN"];
export const SATUAN_LIST = ["Pack", "Kg", "Ekor", "Box", "Pail", "Unit", "Liter"];
export const ENTITIES = ["CV", "PT"];
export { MASTER_CV, MASTER_PT, aliasConfig };
