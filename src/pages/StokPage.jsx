import { useState, useMemo, useEffect } from 'react';
import { useBootstrapRevision } from '../hooks/useBootstrapRevision';
import {
  Search, RefreshCw, LayoutGrid, Boxes, ShieldAlert, TriangleAlert, ShieldCheck,
  ChevronDown, Snowflake, Flame, ChefHat, Utensils, Package, Truck, Layers3,
} from 'lucide-react';
import { useStock } from '../hooks/useStock';
import { classifyStockLevel } from '../data/stockStatus';

function levelOf(stok) {
  const n = Number(stok) || 0;
  const status = classifyStockLevel(n);
  if (status === 'aman') return 'safe';
  if (status === 'waspada') return 'warning';
  return n === 0 ? 'zero' : 'danger';
}

function divisionMeta(name) {
  const value = String(name || '').toUpperCase();
  if (value.includes('BAHAN')) return { icon: Layers3, tone: 'raw' };
  if (value === 'CS' || value.includes('COLD')) return { icon: Snowflake, tone: 'cold' };
  if (value.includes('DAPUR 1') || value.includes('DAPUR I')) return { icon: Flame, tone: 'kitchen' };
  if (value.includes('DAPUR 2') || value.includes('DAPUR II')) return { icon: ChefHat, tone: 'kitchen2' };
  if (value.includes('MIE')) return { icon: Utensils, tone: 'noodle' };
  if (value.includes('PACK')) return { icon: Package, tone: 'packing' };
  if (value.includes('REKAN') || value.includes('OUTLET')) return { icon: Truck, tone: 'partner' };
  return { icon: LayoutGrid, tone: 'default' };
}

function StockRow({ item }) {
  const qty = Number(item.stok ?? item.stockAkhir ?? item.sisa ?? 0) || 0;
  const level = levelOf(qty);
  const tone = level === 'safe' ? 'safe' : level === 'warning' ? 'warning' : level === 'zero' ? 'zero' : 'danger';
  return (
    <div className={`stock-card stock-item-row stock-level-${tone} w-full rounded-xl border px-3.5 py-2.5 box-border`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="stock-item-code text-[10px] font-mono font-semibold truncate">{item.kode || '—'}</p>
          <p className="stock-item-name text-[13px] font-bold truncate leading-snug mt-0.5">{item.nama || 'Tanpa nama'}</p>
          <p className="stock-item-meta text-[10px] mt-0.5 font-medium truncate">{item.divisi || '—'} · {item.satuan || 'Pack'}</p>
        </div>
        <div className="shrink-0 text-right min-w-[3.5rem]">
          <p className={`stock-item-qty text-lg font-extrabold tabular-nums leading-none stock-status-${tone}`}>{qty.toLocaleString('id-ID')}</p>
          <p className="stock-item-unit text-[8px] mt-1 font-bold uppercase tracking-wide">sisa stok</p>
        </div>
      </div>
    </div>
  );
}

export default function StokPage() {
  const [entity, setEntity] = useState('CV');
  const { items, loading, error, refresh } = useStock(entity);
  const bootstrapRevision = useBootstrapRevision();

  useEffect(() => { refresh?.({ force: true }); }, [bootstrapRevision, refresh]);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [openDivisi, setOpenDivisi] = useState(null);

  const entityItems = useMemo(
    () => (items || []).filter((it) => String(it.entity || it.entitas || 'CV').toUpperCase() === entity),
    [items, entity]
  );

  const stats = useMemo(() => {
    const counts = { total: entityItems.length, aman: 0, waspada: 0, kritis: 0 };
    entityItems.forEach((it) => {
      const level = levelOf(it.stok ?? it.stockAkhir ?? 0);
      if (level === 'safe') counts.aman += 1;
      else if (level === 'warning') counts.waspada += 1;
      else counts.kritis += 1;
    });
    return counts;
  }, [entityItems]);

  const divisionCards = useMemo(() => {
    const map = new Map();
    entityItems.forEach((it) => {
      const name = String(it.divisi || 'LAINNYA').trim() || 'LAINNYA';
      if (!map.has(name)) map.set(name, { name, total: 0, kritis: 0, waspada: 0, aman: 0, items: [] });
      const row = map.get(name);
      row.total += 1;
      const level = levelOf(it.stok ?? it.stockAkhir ?? 0);
      if (level === 'safe') row.aman += 1;
      else if (level === 'warning') row.waspada += 1;
      else row.kritis += 1;
      row.items.push(it);
    });

    const q = search.trim().toLowerCase();
    return Array.from(map.values()).map((d) => {
      let list = d.items;
      if (q) list = list.filter((it) => String(it.kode || '').toLowerCase().includes(q) || String(it.nama || '').toLowerCase().includes(q));
      if (filterStatus === 'aman') list = list.filter((it) => levelOf(it.stok ?? it.stockAkhir) === 'safe');
      if (filterStatus === 'waspada') list = list.filter((it) => levelOf(it.stok ?? it.stockAkhir) === 'warning');
      if (filterStatus === 'kritis') list = list.filter((it) => ['danger', 'zero'].includes(levelOf(it.stok ?? it.stockAkhir)));
      return { ...d, filteredItems: list, filteredCount: list.length };
    }).filter((d) => d.filteredCount > 0).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [entityItems, search, filterStatus]);

  const filters = [
    { key: 'all', label: 'Semua' },
    { key: 'kritis', label: 'Kritis' },
    { key: 'waspada', label: 'Waspada' },
    { key: 'aman', label: 'Aman' },
  ];

  const topStats = [
    { key: 'all', label: 'Total Item', value: stats.total, filter: 'all', icon: Boxes, tone: 'total' },
    { key: 'kritis', label: 'Kritis', value: stats.kritis, filter: 'kritis', icon: ShieldAlert, tone: 'critical' },
    { key: 'waspada', label: 'Waspada', value: stats.waspada, filter: 'waspada', icon: TriangleAlert, tone: 'warning' },
    { key: 'aman', label: 'Aman', value: stats.aman, filter: 'aman', icon: ShieldCheck, tone: 'safe' },
  ];

  function toggleDivisi(name) { setOpenDivisi((prev) => prev === name ? null : name); }

  return (
    <div className="stock-page w-full max-w-full box-border space-y-3 pb-28 animate-fade-in overflow-x-hidden">
      <div className="stock-page-title-row flex items-center justify-between gap-2">
        <div>
          <p className="stock-page-kicker">Monitoring persediaan</p>
          <h1 className="stock-page-title text-lg font-extrabold">Data Stok</h1>
        </div>
        <button type="button" onClick={() => refresh?.({ force: true })} className="stock-refresh-btn h-10 w-10 rounded-xl border flex items-center justify-center" aria-label="Refresh data stok" title="Refresh data stok">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="stock-entity-tabs grid grid-cols-2 gap-1 rounded-xl border p-1">
        {['CV', 'PT'].map((e) => (
          <button key={e} type="button" onClick={() => { setEntity(e); setOpenDivisi(null); setFilterStatus('all'); }}
            className={`stock-entity-tab rounded-lg py-2.5 text-sm font-extrabold transition ${entity === e ? 'is-active' : ''}`} aria-pressed={entity === e}>
            {e}
          </button>
        ))}
      </div>

      <div className="stock-status-grid grid grid-cols-2 gap-2">
        {topStats.map((s) => {
          const selected = filterStatus === s.filter;
          const Icon = s.icon;
          return (
            <button key={s.key} type="button" onClick={() => { setFilterStatus(s.filter); setOpenDivisi(null); }}
              aria-pressed={selected} className={`stock-metric-surface stock-stat-card rounded-xl border p-3 text-left transition ${'tone-' + s.tone} ${selected ? 'is-selected' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="stock-stat-icon rounded-lg flex items-center justify-center"><Icon className="h-4 w-4" /></span>
                <span className="stock-stat-caption text-[8px] font-extrabold uppercase tracking-wider">Status</span>
              </div>
              <p className="stock-stat-label text-[10px] font-bold uppercase mt-2">{s.label}</p>
              <p className="stock-stat-value text-2xl font-extrabold tabular-nums leading-none mt-1">{s.value.toLocaleString('id-ID')}</p>
              <p className="stock-stat-unit text-[9px] mt-1 font-semibold">item</p>
            </button>
          );
        })}
      </div>

      <div className="stock-search-wrap relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode / nama…" aria-label="Cari kode atau nama barang" className="stock-search w-full rounded-xl border py-3 pl-10 pr-3 text-sm font-medium" />
      </div>

      <div className="stock-filter-row flex gap-1.5 overflow-x-auto" role="group" aria-label="Filter status stok">
        {filters.map((f) => (
          <button key={f.key} type="button" onClick={() => { setFilterStatus(f.key); setOpenDivisi(null); }}
            className={`stock-filter-chip shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-bold ${filterStatus === f.key ? 'is-active' : ''}`} aria-pressed={filterStatus === f.key}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="stock-section-head flex items-end justify-between gap-2">
        <div>
          <h2 className="stock-section-title text-xs font-extrabold">Divisi · {entity}</h2>
          <p className="stock-section-hint text-[10px] mt-0.5">Ketuk kartu untuk melihat item</p>
        </div>
        <span className="stock-section-count text-[10px] font-bold tabular-nums">{divisionCards.length} divisi</span>
      </div>

      {error && <div className="stock-error rounded-xl border px-3 py-2.5 text-xs" role="alert">{error}</div>}

      <div className="stock-division-list space-y-2">
        {loading && !divisionCards.length && [1, 2, 3].map((i) => <div key={i} className="stock-skeleton h-16 rounded-xl animate-pulse" />)}
        {divisionCards.map((d) => {
          const open = openDivisi === d.name;
          const meta = divisionMeta(d.name);
          const Icon = meta.icon;
          const amanPct = d.total ? (d.aman / d.total) * 100 : 0;
          const warningPct = d.total ? (d.waspada / d.total) * 100 : 0;
          const criticalPct = d.total ? (d.kritis / d.total) * 100 : 0;
          return (
            <section key={d.name} className={`stock-division-card rounded-xl border overflow-hidden ${open ? 'is-open' : ''}`}>
              <button type="button" onClick={() => toggleDivisi(d.name)} aria-expanded={open} className="stock-division-head w-full flex items-center gap-3 px-3 py-3 text-left">
                <span className={`stock-division-icon tone-${meta.tone} h-10 w-10 rounded-xl shrink-0 flex items-center justify-center`}><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="stock-division-name block text-[12px] font-extrabold uppercase tracking-wide truncate">{d.name}</span>
                  <span className="stock-division-meta flex flex-wrap gap-x-2 text-[9px] font-semibold mt-1">
                    <span>{d.filteredCount} item</span><span className="stock-status-safe">{d.aman} aman</span><span className="stock-status-warning">{d.waspada} waspada</span><span className="stock-status-critical">{d.kritis} kritis</span>
                  </span>
                  <span className="stock-division-bar flex overflow-hidden rounded-full mt-2" aria-label={`${d.aman} aman, ${d.waspada} waspada, ${d.kritis} kritis`}>
                    <span className="seg-safe" style={{ width: `${amanPct}%` }} /><span className="seg-warning" style={{ width: `${warningPct}%` }} /><span className="seg-critical" style={{ width: `${criticalPct}%` }} />
                  </span>
                </span>
                <ChevronDown className={`stock-division-chevron h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="stock-division-items border-t px-3 pb-3 pt-2 space-y-2">
                  <p className="stock-division-caption text-[10px] font-semibold py-1">{d.filteredCount} item · {d.name} · {entity}</p>
                  {d.filteredItems.map((item) => <StockRow key={(item.kode || '') + (item.entity || item.entitas || '')} item={item} />)}
                  {!d.filteredItems.length && <p className="stock-empty py-5 text-center text-xs">Tidak ada item pada filter ini.</p>}
                </div>
              )}
            </section>
          );
        })}
        {!loading && !divisionCards.length && (
          <div className="stock-empty-state rounded-xl border py-10 text-center">
            <LayoutGrid className="h-8 w-8 mx-auto mb-2" />
            <p className="text-xs font-semibold">Tidak ada data stok pada filter ini.</p>
          </div>
        )}
      </div>
    </div>
  );
}
