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
  {kode:"CV-0083",nama:"Tahu Walik Promo",satuan:"Pack",divisi:"DAPUR 2"},{kode:"CV-0087",nama:"Kentang Goreng",satuan:"Pack",divisi:"DAPUR 2"},
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
  {kode:"BBPT-0001",nama:"Bonelles Dada",satuan:"Kg",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0002",nama:"Bonelles Paha",satuan:"Kg",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0003",nama:"Kulit Ayam",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0004",nama:"Paha Stick",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0005",nama:"Sayap Cutting 2",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0006",nama:"Minyak Ayam",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0007",nama:"Ayam Negeri",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0008",nama:"Iga Sapi",satuan:"Kg",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0009",nama:"Lemak Ayam",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0010",nama:"Bonelles Paha Kulit",satuan:"Kg",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0011",nama:"Ayam Pejantan",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0012",nama:"Bebek",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0017",nama:"Ayam Paha Custom (40)",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0018",nama:"Ayam Paha Custom (50)",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"BBPT-0019",nama:"Ayam Paha Custom (90)",satuan:"Pack",divisi:"BAHAN BAKU"},
  {kode:"MM-0002",nama:"Bumbu Soto Daging",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0004",nama:"Geprek Paha",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0005",nama:"Bakso Sapi Halus",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0006",nama:"Bakso Sapi Kasar",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0007",nama:"Saos Dimsum",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0008",nama:"Sambal Bawang",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0009",nama:"Sambal Hijau",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0010",nama:"1 Paket Rawon",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0011",nama:"Bumbu Gado-Gado",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0012",nama:"Bumbu Rujak Cingur",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0013",nama:"Pempek Kapal Selam",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0014",nama:"Pempek Lenjer",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0015",nama:"Siomay",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0016",nama:"Kuah Cuko",satuan:"Pack",divisi:"CS"},
  {kode:"MM-0017",nama:"Rawon Madiun",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0001",nama:"Ayam Fillet Dada",satuan:"Kg",divisi:"CS"},
  {kode:"PT-0002",nama:"Ayam Fillet Paha",satuan:"Kg",divisi:"CS"},
  {kode:"PT-0003",nama:"Ayam Suwir BLD",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0004",nama:"Ayam Paha Panggang",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"PT-0005",nama:"Udang PND (115/1kg)",satuan:"Kg",divisi:"CS"},
  {kode:"PT-0006",nama:"Cumi Cumi",satuan:"Kg",divisi:"CS"},
  {kode:"PT-0007",nama:"Bakso Ikan CIDEA (500 GRAM)",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0008",nama:"Bakso Ikan",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0009",nama:"Daging Sapi Slice (YAKINIKU)",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0010",nama:"Tulang Kepala Ceker",satuan:"Kg",divisi:"DAPUR 1"},
  {kode:"PT-0011",nama:"Nugget",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"PT-0012",nama:"Chiken Wing",satuan:"Pack",divisi:"DAPUR 1"},
  {kode:"PT-0013",nama:"Mie Goreng",satuan:"Kg",divisi:"MIE"},
  {kode:"PT-0014",nama:"Mie Rebus",satuan:"Kg",divisi:"MIE"},
  {kode:"PT-0015",nama:"Daging Pangsit",satuan:"Pack",divisi:"DAPUR 1"},
  {kode:"PT-0016",nama:"Kulit Pangsit Goreng",satuan:"Pack",divisi:"MIE"},
  {kode:"PT-0017",nama:"Kulit Pangsit Rebus",satuan:"Pack",divisi:"MIE"},
  {kode:"PT-0018",nama:"Bumbu Mie",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0019",nama:"Minyak Mie",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0020",nama:"Saos Masakan",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0021",nama:"Saos Asam Manis",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0022",nama:"Saos Lada Hitam",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0023",nama:"Saos Cah Cabai",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0024",nama:"Bumbu Nasi Goreng Jawa",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0025",nama:"Bumbu Pedas",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0026",nama:"Saos AM Pedas",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0027",nama:"Saos Tom Yum",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0028",nama:"Sambal Produksi",satuan:"Kg",divisi:"PACKING"},
  {kode:"PT-0029",nama:"Ice Cream Vanilla",satuan:"Pail",divisi:"CS"},
  {kode:"PT-0030",nama:"Nugget Katsu",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"PT-0032",nama:"Bumbu Soto Ayam",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0034",nama:"Ayam Parting 10 Fresh",satuan:"Ekor",divisi:"CS"},
  {kode:"PT-0035",nama:"Fish Roll",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"PT-0037",nama:"Tulang Krongkongan",satuan:"Kg",divisi:"CS"},
  {kode:"PT-0039",nama:"Saos Nasgor Merah (30gr/10pcs)",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0043",nama:"Tahu Walik Promo",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"PT-0044",nama:"Daging Slice (LOWFAT)",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0045",nama:"Chiken Katsu (promo 50)",satuan:"Pack",divisi:"DAPUR 1"},
  {kode:"PT-0046",nama:"Chiken Katsu Jumbo",satuan:"Pack",divisi:"DAPUR 1"},
  {kode:"PT-0047",nama:"Ayam Ukep Parting 10",satuan:"Ekor",divisi:"CS"},
  {kode:"PT-0048",nama:"Chicken Roll",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"PT-0049",nama:"Chicken Shrimp Roll",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"PT-0050",nama:"Chicken Ball",satuan:"Pack",divisi:"DAPUR 2"},
  {kode:"PT-0051",nama:"Sosis PRONAS (500 GRAM)",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0052",nama:"Saos Lada Hitam (PROMO)",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0053",nama:"Sosis Vitalia (480 gram)",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0054",nama:"Saos Keju",satuan:"Pack",divisi:"PACKING"},
  {kode:"PT-0055",nama:"Kacang Merah",satuan:"Kg",divisi:"PACKING"},
  {kode:"PT-0056",nama:"Cireng (24 pcs)",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0057",nama:"Kulit Lumpia (40 pcs)",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0058",nama:"Singkong Keju",satuan:"Pack",divisi:"CS"},
  {kode:"PT-0059",nama:"Degan Frozen (1 kg)",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0003",nama:"Bumbu Mendoan",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0004",nama:"Iga Sapi",satuan:"Kg",divisi:"CS"},
  {kode:"WK-0008",nama:"Saos Bakaran",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0009",nama:"Bumbu Urap Urap",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0010",nama:"Sambel Bajak",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0012",nama:"Nangka Kupas",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0013",nama:"Mie Asmara Baru",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0014",nama:"Saos Spesial",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0015",nama:"Sambal Korek",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0016",nama:"Ayam Spesial Asmara",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0017",nama:"Ayam Putih Asmara",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0019",nama:"Bumbu Mie Asmara",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0020",nama:"Golden Farm Mix",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0021",nama:"Saos Ayam 69",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0022",nama:"Cingur Sapi",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0023",nama:"Sosis Vigo",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0025",nama:"Ayam Merah Soto",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0026",nama:"Sambal Soto",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0028",nama:"Saos Agm Promo",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0029",nama:"Saos Rica-Rica Promo",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0030",nama:"Saos Kecap Inggris Promo",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0031",nama:"Ayam Agm Promo",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0032",nama:"Es Cream 3 Rasa",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0038",nama:"Ayam Penyet",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0039",nama:"Ayam Negeri 2 Dada + 2 Paha",satuan:"Pack",divisi:"CS"},
  {kode:"WK-0040",nama:"Bebek Penyet",satuan:"Pack",divisi:"CS"}
];

function getBootstrapMaster() {
  try {
    const raw = localStorage.getItem('gudangai_bootstrap_items');
    const items = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(items) || items.length < 100) return null;
    const normalized = items.map((it) => {
      const kode = String(it?.kode || it?.kodeBarang || it?.code || '').trim();
      const nama = String(it?.nama || it?.namaBarang || it?.name || '').trim();
      const satuan = String(it?.satuan || it?.unit || it?.satuanBarang || '').trim();
      const divisi = String(it?.divisi || it?.division || it?.departemen || '').trim();
      const prefix = kode.toUpperCase().split('-')[0];
      const entity = String(
        it?.entitas || it?.entity ||
        (['PT','WK','MM','BBPT'].includes(prefix) ? 'PT' :
         ['CV','BBCV'].includes(prefix) ? 'CV' : '')
      ).toUpperCase();
      return { kode, nama, satuan, divisi, entity };
    }).filter((it) => it.kode && it.nama && (it.entity === 'CV' || it.entity === 'PT'));
    const cv = normalized.filter((it) => it.entity === 'CV').map(({ entity, ...it }) => it);
    const pt = normalized.filter((it) => it.entity === 'PT').map(({ entity, ...it }) => it);
    if (cv.length === 0 || pt.length === 0 || (cv.length + pt.length) < 100) return null;
    return { CV: cv, PT: pt };
  } catch (_) {
    return null;
  }
}

function normalizeAliasText(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\bchicken\b/g, 'chiken')
    .replace(/\bsambel\b/g, 'sambal')
    .replace(/\bspesial\b/g, 'special')
    .replace(/[-–—]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getAliasLookup(entity) {
  const aliases = (aliasConfig && aliasConfig.aliases && aliasConfig.aliases[entity]) || {};
  const lookup = {};
  for (const [kode, list] of Object.entries(aliases)) {
    for (const a of list || []) {
      if (a) {
        const raw = String(a).toLowerCase().trim();
        lookup[raw] = kode;
        lookup[normalizeAliasText(a)] = kode;
      }
    }
  }
  return lookup;
}

export function getMasterByEntity(entity) {
  const boot = getBootstrapMaster();
  const key = String(entity || '').toUpperCase() === 'CV' ? 'CV' : 'PT';
  return boot?.[key] || (key === 'CV' ? MASTER_CV : MASTER_PT);
}
export function getAllMaster() {
  const boot = getBootstrapMaster();
  return boot || { CV: MASTER_CV, PT: MASTER_PT };
}
export function findByKode(kode) {
  const boot = getBootstrapMaster();
  const list = boot ? [...boot.CV, ...boot.PT] : [...MASTER_CV, ...MASTER_PT];
  return list.find(i => i.kode === kode);
}

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
  const normalized = normalizeAliasText(name)
    .replace(/\b(kg|gram|grams|gr|pack|pcs|pc|pail|ekor|box|unit|porsi|liter|lusin|botol|kaleng|karung)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const lookup = getAliasLookup(entity);
  const compact = normalized.replace(/\s+/g, '');
  const list = getMasterByEntity(entity);
  if (lookup[normalized] || lookup[compact]) {
    const item = list.find(i => i.kode === (lookup[normalized] || lookup[compact]));
    if (item) return { item, matchType: 'alias-exact' };
  }
  const namaMatch = list.find(i => i.nama.toLowerCase() === normalized);
  if (namaMatch) return { item: namaMatch, matchType: 'nama-exact' };
  for (const [alias, kode] of Object.entries(lookup)) {
    const a = normalizeAliasText(alias);
    if (!a) continue;
    if (a === normalized || a.replace(/\s+/g, '') === compact || a.includes(normalized) || normalized.includes(a)) {
      const item = list.find(i => i.kode === kode);
      if (item) return { item, matchType: 'alias-partial' };
    }
  }
  const partial = list.find(i => i.nama.toLowerCase().includes(normalized) || normalized.includes(i.nama.toLowerCase()));
  if (partial) return { item: partial, matchType: 'nama-partial' };
  return null;
}

export const DIVISIONS = ["CS", "MIE", "DAPUR 1", "DAPUR 2", "PACKING", "BAHAN BAKU", "REKANAN"];
export const SATUAN_LIST = ["Pack", "Kg", "Ekor", "Box", "Pail", "Unit", "Liter"];
export const ENTITIES = ["CV", "PT"];
export { MASTER_CV, MASTER_PT, aliasConfig };
