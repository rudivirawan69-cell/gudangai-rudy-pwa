import { useState, useMemo, useEffect, useCallback } from 'react';
import { useBootstrapRevision } from '../hooks/useBootstrapRevision';
import {
  Search, RefreshCw, LayoutGrid, Boxes, ShieldAlert, TriangleAlert, ShieldCheck, ChevronDown, Building2, Package,
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

function StockRow({ item }) {
  const qty = Number(item.stok ?? item.stockAkhir ?? item.sisa ?? 0) || 0;
  const level = levelOf(qty);
  const border = {
    safe: 'border-l-emerald-500',
    warning: 'border-l-amber-400',
    danger: 'border-l-red-500',
    zero: 'border-l-slate-300',
  }[level];
  const numColor = {
    safe: 'text-slate-900',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    zero: 'text-slate-400',
  }[level];

  return (
    <div className={`stock-card w-full rounded-xl bg-white border border-slate-100 shadow-sm border-l-4 ${border} px-3.5 py-2.5 box-border`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-slate-400 font-mono font-medium truncate">{item.kode}</p>
          <p className="text-[13px] font-bold text-slate-900 truncate leading-snug mt-0.5">{item.nama}</p>
          <p className="text-[10px] text-slate-500 mt-0.5 font-medium truncate">
            {item.divisi || '—'} · {item.satuan || 'Pack'}
          </p>
        </div>
        <div className="shrink-0 text-right min-w-[3rem]">
          <p className={`text-lg font-extrabold tabular-nums leading-none ${numColor}`}>
            {qty.toLocaleString('id-ID')}
          </p>
          <p className="text-[8px] text-slate-400 mt-0.5 font-semibold uppercase tracking-wide">sisa</p>
        </div>
      </div>
    </div>
  );
}

export default function StokPage() {
  const [entity, setEntity] = useState('CV');
  const {
    items: cvItems, loading: cvLoading, error: cvError, refresh: refreshCV,
  } = useStock('CV');
  const {
    items: ptItems, loading: ptLoading, error: ptError, refresh: refreshPT,
  } = useStock('PT');
  const bootstrapRevision = useBootstrapRevision();

  const refresh = useCallback((options = { force: true }) => {
    refreshCV?.(options);
    refreshPT?.(options);
  }, [refreshCV, refreshPT]);

  useEffect(() => {
    refresh({ force: true });
  }, [bootstrapRevision, refresh]);
  const items = entity === 'CV' ? cvItems : ptItems;
  const loading = entity === 'CV' ? cvLoading : ptLoading;
  const error = entity === 'CV' ? cvError : ptError;
  const cvSummary = useMemo(() => ({
    items: cvItems || [],
    sku: (cvItems || []).length,
    units: (cvItems || []).reduce((sum, item) => sum + (Number(item.stok ?? item.stockAkhir ?? 0) || 0), 0),
  }), [cvItems]);
  const ptSummary = useMemo(() => ({
    items: ptItems || [],
    sku: (ptItems || []).length,
    units: (ptItems || []).reduce((sum, item) => sum + (Number(item.stok ?? item.stockAkhir ?? 0) || 0), 0),
  }), [ptItems]);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  /** Nama divisi yang dibuka — item muncul di dalam kartu divisi */
  const [openDivisi, setOpenDivisi] = useState(null);

  const entityItems = useMemo(
    () => (items || []).filter((it) => (it.entity || it.entitas || 'CV') === entity),
    [items, entity]
  );

  const stats = useMemo(() => {
    let aman = 0;
    let waspada = 0;
    let kritis = 0;
    let habis = 0;
    entityItems.forEach((it) => {
      const n = Number(it.stok ?? it.stockAkhir ?? 0) || 0;
      const l = levelOf(n);
      if (l === 'safe') aman += 1;
      else if (l === 'warning') waspada += 1;
      else if (l === 'danger') kritis += 1;
      else habis += 1;
    });
    return { total: entityItems.length, aman, waspada, kritis: kritis + habis };
  }, [entityItems]);

  /** Ringkasan per divisi + daftar item (setelah filter status & search) */
  const divisionCards = useMemo(() => {
    const map = new Map();
    entityItems.forEach((it) => {
      const name = String(it.divisi || 'LAINNYA').trim() || 'LAINNYA';
      if (!map.has(name)) {
        map.set(name, { name, total: 0, kritis: 0, waspada: 0, aman: 0, items: [] });
      }
      const row = map.get(name);
      row.total += 1;
      const l = levelOf(it.stok ?? it.stockAkhir);
      if (l === 'safe') row.aman += 1;
      else if (l === 'warning') row.waspada += 1;
      else row.kritis += 1;
      row.items.push(it);
    });

    const q = search.trim().toLowerCase();
    return Array.from(map.values())
      .map((d) => {
        let list = d.items;
        if (q) {
          list = list.filter(
            (it) =>
              (it.kode || '').toLowerCase().includes(q) ||
              (it.nama || '').toLowerCase().includes(q)
          );
        }
        if (filterStatus === 'aman') list = list.filter((it) => levelOf(it.stok ?? it.stockAkhir) === 'safe');
        if (filterStatus === 'menipis') list = list.filter((it) => levelOf(it.stok ?? it.stockAkhir) === 'warning');
        if (filterStatus === 'kritis') {
          list = list.filter((it) => {
            const l = levelOf(it.stok ?? it.stockAkhir);
            return l === 'danger' || l === 'zero';
          });
        }
        return { ...d, filteredItems: list, filteredCount: list.length };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [entityItems, search, filterStatus]);

  const topStats = [
    { key: 'all', label: 'TOTAL ITEM', value: stats.total, detail: 'SKU pada entitas aktif', color: 'text-slate-900', filter: 'all', ring: 'ring-slate-300', icon: Boxes, iconClass: 'stock-metric-icon-cyan', kind: 'filter' },
    { key: 'cv', label: 'STOCK CV', value: cvSummary.units, detail: `${cvSummary.sku.toLocaleString('id-ID')} SKU · total unit`, color: 'text-cyan-700', icon: Building2, iconClass: 'stock-metric-icon-cyan', kind: 'entity' },
    { key: 'pt', label: 'STOCK PT', value: ptSummary.units, detail: `${ptSummary.sku.toLocaleString('id-ID')} SKU · total unit`, color: 'text-orange-700', icon: Building2, iconClass: 'stock-metric-icon-amber', kind: 'entity' },
    { key: 'aman', label: 'AMAN', value: stats.aman, detail: 'item', color: 'text-emerald-600', filter: 'aman', ring: 'ring-emerald-300', icon: ShieldCheck, iconClass: 'stock-metric-icon-green', kind: 'filter' },
    { key: 'menipis', label: 'WASPADA', value: stats.waspada, detail: 'item', color: 'text-amber-600', filter: 'menipis', ring: 'ring-amber-300', icon: TriangleAlert, iconClass: 'stock-metric-icon-amber', kind: 'filter' },
    { key: 'kritis', label: 'KRITIS', value: stats.kritis, detail: 'item', color: 'text-red-600', filter: 'kritis', ring: 'ring-red-300', icon: ShieldAlert, iconClass: 'stock-metric-icon-red', kind: 'filter' },
  ];

  function toggleDivisi(name) {
    setOpenDivisi((prev) => (prev === name ? null : name));
  }

  return (
    <div className="w-full max-w-full box-border space-y-3 pb-28 animate-fade-in overflow-x-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-slate-900">Data Stock</h1>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">Ringkasan dan kondisi stok seluruh divisi</p>
        </div>
        <button
          type="button"
          onClick={() => refresh?.({ force: true })}
          className="w-10 h-10 rounded-xl bg-white/95 border border-slate-200 shadow-sm flex items-center justify-center"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="w-full rounded-2xl bg-white border border-slate-100 shadow-sm p-1.5 flex gap-1">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setEntity(e);
              setOpenDivisi(null);
              setFilterStatus('all');
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              entity === e ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Enam kartu ringkasan: angka entitas CV/PT + status stok entitas yang sedang dipilih */}
      <section className="stock-overview-grid grid grid-cols-2 gap-2 w-full" aria-label="Ringkasan Data Stock">
        {topStats.map((card) => {
          const Icon = card.icon;
          const selected = card.kind === 'filter' && filterStatus === card.filter;
          const content = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className={`stock-metric-icon ${card.iconClass} h-8 w-8 rounded-xl flex items-center justify-center`}>
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <span className="text-[8px] font-extrabold uppercase tracking-wider text-slate-400">
                  {card.kind === 'entity' ? 'ENTITAS' : 'STATUS'}
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] font-extrabold text-slate-500 uppercase tracking-wide mt-2">{card.label}</p>
              <p className={`text-xl sm:text-2xl font-extrabold tabular-nums leading-none mt-1 ${card.color}`}>
                {Number(card.value || 0).toLocaleString('id-ID')}
              </p>
              <p className="text-[9px] text-slate-400 mt-1 font-medium leading-tight">{card.detail}</p>
            </>
          );
          if (card.kind === 'entity') {
            return <div key={card.key} className={`stock-entity-card stock-entity-${card.key} rounded-xl border px-3 py-2.5 text-left min-w-0`}>{content}</div>;
          }
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => { setFilterStatus(card.filter); setOpenDivisi(null); }}
              aria-pressed={selected}
              className={`stock-metric-surface rounded-xl bg-white border border-slate-100 shadow-sm px-3 py-2.5 text-left transition min-w-0 ${
                selected ? `ring-2 ${card.ring} is-selected` : ''
              }`}
            >
              {content}
            </button>
          );
        })}
      </section>

      <div className="relative w-full">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode / nama…"
          className="w-full pl-10 pr-3 py-3 rounded-2xl border border-slate-100 bg-white text-sm text-slate-900 shadow-sm font-medium placeholder:text-slate-400"
        />
      </div>

      <div className="px-0.5">
        <p className="text-[12px] font-bold text-slate-700">Divisi · {entity}</p>
        <p className="text-[11px] text-slate-500 mt-0.5">Ketuk kartu divisi untuk melihat item</p>
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      {/* Kartu divisi full-width — klik = buka item di dalam kartu */}
      <div className="space-y-2.5 w-full">
        {loading && !divisionCards.length && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl skeleton" />
            ))}
          </div>
        )}

        {divisionCards.map((d) => {
          const open = openDivisi === d.name;
          return (
            <div
              key={d.name}
              className={`w-full rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden transition ${
                open ? 'ring-2 ring-cyan-400' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => toggleDivisi(d.name)}
                aria-expanded={open}
                className="w-full px-3.5 py-3.5 text-left flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-700 flex items-center justify-center shrink-0">
                  <LayoutGrid className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-extrabold text-slate-900 uppercase tracking-wide truncate">{d.name}</p>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    {d.filteredCount} item
                    {filterStatus !== 'all' ? ` · filter ${filterStatus}` : ''}
                    {' · '}
                    <span className="text-emerald-600">{d.aman} aman</span>
                    {' · '}
                    <span className="text-amber-600">{d.waspada} waspada</span>
                    {' · '}
                    <span className="text-red-600">{d.kritis} kritis</span>
                  </p>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {open && (
                <div className="px-3 pb-3 pt-0 border-t border-slate-100 space-y-2">
                  <p className="text-[11px] text-slate-500 font-medium py-2">
                    {d.filteredCount} item · {d.name} · {entity}
                  </p>
                  {d.filteredItems.map((item) => (
                    <StockRow key={(item.kode || '') + (item.entity || '')} item={item} />
                  ))}
                  {!d.filteredItems.length && (
                    <div className="py-6 text-center">
                      <p className="text-xs text-slate-400 font-medium">Tidak ada item di divisi ini</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!loading && !divisionCards.length && (
          <div className="rounded-2xl bg-white border border-slate-100 shadow-sm py-12 text-center">
            <LayoutGrid className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">Tidak ada data stok</p>
          </div>
        )}
      </div>
    </div>
  );
}
