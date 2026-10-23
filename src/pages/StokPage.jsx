import { useState, useMemo, useEffect } from 'react';
import { useBootstrapRevision } from '../hooks/useBootstrapRevision';
import { Search, RefreshCw, LayoutGrid, Boxes, ShieldAlert, TriangleAlert, ShieldCheck, ChevronDown } from 'lucide-react';
import { useStock } from '../hooks/useStock';

function levelOf(stok) {
  const n = Number(stok) || 0;
  if (n === 0) return 'zero';
  if (n <= 5) return 'danger';
  if (n <= 20) return 'warning';
  return 'safe';
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
    safe: 'text-slate-900 dark:text-slate-100',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    zero: 'text-slate-400',
  }[level];

  return (
    <div className={`w-full rounded-xl bg-white/90 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/50 shadow-sm border-l-4 ${border} px-3 py-2.5 box-border`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-slate-400 font-mono font-medium truncate">{item.kode}</p>
          <p className="text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate leading-snug mt-0.5">{item.nama}</p>
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

const FILTER_LABEL = {
  all: 'Semua',
  kritis: 'Kritis',
  menipis: 'Waspada',
  aman: 'Aman',
};

export default function StokPage() {
  const [entity, setEntity] = useState('CV');
  const { items, loading, error, refresh } = useStock(entity);
  const bootstrapRevision = useBootstrapRevision();

  useEffect(() => {
    refresh?.({ force: true });
  }, [bootstrapRevision, refresh]);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [divisi, setDivisi] = useState('Semua');
  /** Kartu mana yang dibuka — item muncul DI DALAM kartu, bukan di bawah list terpisah */
  const [expandedKey, setExpandedKey] = useState(null);

  const entityItems = useMemo(
    () => (items || []).filter((it) => (it.entity || it.entitas || 'CV') === entity),
    [items, entity]
  );

  const divisions = useMemo(() => {
    const set = new Set();
    entityItems.forEach((it) => {
      if (it.divisi) set.add(it.divisi);
    });
    return ['Semua', ...Array.from(set).sort()];
  }, [entityItems]);

  const stats = useMemo(() => {
    let aman = 0,
      waspada = 0,
      kritis = 0,
      habis = 0;
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

  const filtered = useMemo(() => {
    let list = entityItems;
    if (divisi !== 'Semua') list = list.filter((it) => it.divisi === divisi);
    const q = search.trim().toLowerCase();
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
    return list;
  }, [entityItems, divisi, search, filterStatus]);

  const itemsForCard = useMemo(() => {
    if (!expandedKey) return [];
    let list = entityItems;
    if (divisi !== 'Semua') list = list.filter((it) => it.divisi === divisi);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (it) =>
          (it.kode || '').toLowerCase().includes(q) ||
          (it.nama || '').toLowerCase().includes(q)
      );
    }
    if (expandedKey === 'kritis') {
      list = list.filter((it) => {
        const l = levelOf(it.stok ?? it.stockAkhir);
        return l === 'danger' || l === 'zero';
      });
    } else if (expandedKey === 'menipis') {
      list = list.filter((it) => levelOf(it.stok ?? it.stockAkhir) === 'warning');
    } else if (expandedKey === 'aman') {
      list = list.filter((it) => levelOf(it.stok ?? it.stockAkhir) === 'safe');
    }
    return list;
  }, [entityItems, expandedKey, divisi, search]);

  const topStats = [
    {
      key: 'total',
      label: 'TOTAL ITEM',
      value: stats.total,
      color: 'text-slate-900 dark:text-slate-100',
      sub: 'item',
      filter: 'all',
      ring: 'ring-slate-300',
      icon: Boxes,
      iconClass: 'stock-metric-icon-cyan',
    },
    {
      key: 'kritis',
      label: 'KRITIS',
      value: stats.kritis,
      color: 'text-red-600',
      sub: 'item',
      filter: 'kritis',
      ring: 'ring-red-300',
      icon: ShieldAlert,
      iconClass: 'stock-metric-icon-red',
    },
    {
      key: 'menipis',
      label: 'WASPADA',
      value: stats.waspada,
      color: 'text-amber-600',
      sub: 'item',
      filter: 'menipis',
      ring: 'ring-amber-300',
      icon: TriangleAlert,
      iconClass: 'stock-metric-icon-amber',
    },
    {
      key: 'aman',
      label: 'AMAN',
      value: stats.aman,
      color: 'text-emerald-600',
      sub: 'item',
      filter: 'aman',
      ring: 'ring-emerald-300',
      icon: ShieldCheck,
      iconClass: 'stock-metric-icon-green',
    },
  ];

  function toggleExpand(key, filter) {
    if (expandedKey === key) {
      setExpandedKey(null);
      setFilterStatus('all');
    } else {
      setExpandedKey(key);
      setFilterStatus(filter);
    }
  }

  return (
    <div className="w-full max-w-full box-border space-y-3 pb-28 animate-fade-in overflow-x-hidden">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Stok</h1>
        <button
          type="button"
          onClick={() => refresh?.({ force: true })}
          className="w-10 h-10 rounded-xl bg-white/95 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm flex items-center justify-center"
          aria-label="Refresh"
        >
          <RefreshCw className={`w-4 h-4 text-slate-600 dark:text-slate-300 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="w-full rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 shadow-sm p-1.5 flex gap-1">
        {['CV', 'PT'].map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => {
              setEntity(e);
              setDivisi('Semua');
              setFilterStatus('all');
              setExpandedKey(null);
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              entity === e ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Kartu metrik — klik = buka daftar item DI DALAM kartu */}
      <div className="grid grid-cols-1 gap-2.5 w-full">
        {topStats.map((s) => {
          const selected = expandedKey === s.key;
          const Icon = s.icon;
          return (
            <div
              key={s.key}
              className={`stock-metric-surface rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden transition ${
                selected ? `ring-2 ${s.ring} is-selected` : ''
              }`}
            >
              <button
                type="button"
                onClick={() => toggleExpand(s.key, s.filter)}
                aria-expanded={selected}
                className="w-full px-3.5 py-3 text-left flex items-center gap-3"
              >
                <span className={`stock-metric-icon ${s.iconClass} shrink-0`}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{s.label}</p>
                    <span className="text-[9px] font-extrabold text-slate-400">STATUS</span>
                  </div>
                  <div className="flex items-end justify-between mt-1">
                    <p className={`text-2xl font-extrabold tabular-nums leading-none ${s.color}`}>{s.value}</p>
                    <p className="text-[11px] text-slate-400 font-medium">{s.sub}</p>
                  </div>
                </div>
                <ChevronDown
                  className={`w-5 h-5 text-slate-400 shrink-0 transition-transform duration-200 ${
                    selected ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Item list — hanya di dalam kartu yang terbuka */}
              {selected && (
                <div className="px-3 pb-3 pt-0 border-t border-slate-100 dark:border-slate-700/60">
                  <div className="flex items-center justify-between py-2">
                    <p className="text-[11px] text-slate-500 font-medium">
                      {itemsForCard.length} item · {entity}
                      {filterStatus !== 'all' ? ` · ${FILTER_LABEL[filterStatus]}` : ''}
                    </p>
                  </div>

                  {loading && !itemsForCard.length && (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-14 rounded-xl skeleton" />
                      ))}
                    </div>
                  )}

                  <div className="space-y-2 max-h-[50vh] overflow-y-auto no-scrollbar">
                    {itemsForCard.map((item) => (
                      <StockRow key={(item.kode || '') + (item.entity || '')} item={item} />
                    ))}
                    {!loading && !itemsForCard.length && (
                      <div className="py-8 text-center">
                        <LayoutGrid className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
                        <p className="text-xs text-slate-400 font-medium">Tidak ada item</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="relative w-full">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari kode / nama…"
          className="w-full pl-10 pr-3 py-3 rounded-2xl border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 shadow-sm font-medium placeholder:text-slate-400"
        />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-0.5 w-full">
        {divisions.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDivisi(d)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold border transition ${
              divisi === d
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-200 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      {/* Ringkasan cepat saat tidak ada kartu yang dibuka */}
      {!expandedKey && (
        <div className="rounded-2xl bg-white/80 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 shadow-sm px-4 py-6 text-center">
          <LayoutGrid className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">Ketuk kartu status di atas</p>
          <p className="text-xs text-slate-400 mt-1">Daftar item akan muncul di dalam kartu yang dipilih</p>
        </div>
      )}
    </div>
  );
}
