import { memo, useMemo, useState, useEffect, useCallback, useDeferredValue } from "react";
import "./stok.css";
import { useStock } from "../hooks/useStock";
import { ENTITAS, TIDAK_TERKLASIFIKASI, normalizeAll } from "../data/stokAdapter.js";

/**
 * StokPage — redesain v2.1 + optimasi render
 * - memo(ItemRow/Divisi), deferred search, paginasi 60 item
 */

const RANK = { kritis: 0, waspada: 1, aman: 2 };
const LABEL = { kritis: "Kritis", waspada: "Waspada", aman: "Aman" };
const CACHE_KEY = "gudangai:stok:snapshot:v1";
const BATCH = 60;

const fmt = (n) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);
const fmtCount = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

function ringkas(list) {
  const c = { total: list.length, kritis: 0, waspada: 0, aman: 0 };
  list.forEach((i) => (c[i.status] += 1));
  return c;
}

function Bar({ c }) {
  const t = c.total || 1;
  return (
    <div className="sk-bar" aria-hidden="true">
      <i className="sk-aman" style={{ width: `${(c.aman / t) * 100}%` }} />
      <i className="sk-waspada" style={{ width: `${(c.waspada / t) * 100}%` }} />
      <i className="sk-kritis" style={{ width: `${(c.kritis / t) * 100}%` }} />
    </div>
  );
}

const ItemRow = memo(function ItemRow({ it, onOpen }) {
  return (
    <button type="button" className={`sk-item sk-item-card sk-card-${it.status}`} onClick={() => onOpen(it)}>
      <div className="sk-item-top">
        <div className="sk-item-main">
          <span className="sk-item-nama">{it.nama}</span>
          <span className="sk-item-kode">{it.kode || "Tanpa kode"}</span>
        </div>
        <span className={`sk-item-status sk-${it.status}`}>{LABEL[it.status]}</span>
      </div>
      <div className="sk-item-metrics">
        <div className="sk-item-metric">
          <span className="sk-item-metric-label">Sisa stok</span>
          <strong>{fmt(it.stok)} <small>{it.satuan}</small></strong>
        </div>
        <div className="sk-item-metric">
          <span className="sk-item-metric-label">Stok aman</span>
          <strong>{it.min > 0 ? <>{fmt(it.min)} <small>{it.satuan}</small></> : "—"}</strong>
        </div>
      </div>
    </button>
  );
});

function Sheet({ it, onClose, onInput }) {
  if (!it) return null;
  const kurang = it.min > 0 ? Math.max(0, it.min - it.stok) : 0;
  return (
    <div className="sk-sheet-wrap" onClick={onClose}>
      <div className="sk-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sk-grab" />
        <h3>{it.nama}</h3>
        <p className="sk-muted">
          {it.kode} · {it.divisi} · {it.entitas}
        </p>
        <div className="sk-sheet-grid">
          <div><small>Sisa stok</small><b>{fmt(it.stok)} {it.satuan}</b></div>
          <div><small>Stok aman (target)</small><b>{it.min ? `${fmt(it.min)} ${it.satuan}` : "—"}</b></div>
          <div><small>Status</small><b className={`t-${it.status}`}>{LABEL[it.status]}</b></div>
          <div><small>Saran restok</small><b>{kurang > 0 ? `${fmt(kurang)} ${it.satuan}` : "—"}</b></div>
        </div>
        {onInput && (
          <button type="button" className="sk-primary" onClick={() => onInput(it)}>
            Catat transaksi item ini
          </button>
        )}
      </div>
    </div>
  );
}

export default function StokPage() {
  const { items: rawItems, loading, error, refresh, lastRefresh } = useStock("ALL");
  const onInput = undefined;

  const [entitas, setEntitas] = useState("CV");
  const [divFilter, setDivFilter] = useState(null);
  const [filter, setFilter] = useState("semua");
  const [q, setQ] = useState("");
  const qDeferred = useDeferredValue(q);
  const [limit, setLimit] = useState(BATCH);
  const [open, setOpen] = useState({});
  const [detail, setDetail] = useState(null);
  const onOpenItem = useCallback((it) => setDetail(it), []);
  const onCloseSheet = useCallback(() => setDetail(null), []);
  const onToggleDiv = useCallback((nama) => {
    setOpen((prev) => ({ ...prev, [nama]: !prev[nama] }));
  }, []);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState("");
  const [cache, setCache] = useState(null);

  useEffect(() => {
    try {
      if (Array.isArray(rawItems) && rawItems.length) {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: rawItems }));
      } else {
        const raw = localStorage.getItem(CACHE_KEY);
        if (raw) setCache(JSON.parse(raw));
      }
    } catch {}
  }, [rawItems]);

  useEffect(() => {
    setDivFilter(null);
    setFilter("semua");
  }, [entitas]);

  useEffect(() => {
    setLimit(BATCH);
  }, [entitas, divFilter, filter, qDeferred]);

  const memakaiCache = !(rawItems && rawItems.length) && cache?.data?.length;
  const sumber = memakaiCache ? cache.data : rawItems || [];

  const { items: semua, laporan } = useMemo(
    () => normalizeAll(sumber, { targetTotal: 193 }),
    [sumber]
  );
  const perEntitas = useMemo(
    () => semua.filter((i) => i.entitas === entitas),
    [semua, entitas]
  );
  const tabs = useMemo(
    () => (laporan.tanpaEntitas > 0 ? [...ENTITAS, TIDAK_TERKLASIFIKASI] : ENTITAS),
    [laporan.tanpaEntitas]
  );
  const daftarDivisi = useMemo(() => {
    const m = new Map();
    perEntitas.forEach((i) => {
      const d = i.divisi || "Lainnya";
      m.set(d, (m.get(d) || 0) + 1);
    });
    return [...m.entries()]
      .map(([nama, n]) => ({ nama, n }))
      .sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  }, [perEntitas]);

  const terfilter = useMemo(() => {
    const k = qDeferred.trim().toLowerCase();
    return perEntitas
      .filter((i) => !divFilter || i.divisi === divFilter)
      .filter((i) => filter === "semua" || i.status === filter)
      .filter((i) => !k || (i.nama || "").toLowerCase().includes(k) || String(i.kode || "").toLowerCase().includes(k))
      .sort((a, b) => RANK[a.status] - RANK[b.status] || a.nama.localeCompare(b.nama));
  }, [perEntitas, divFilter, filter, qDeferred]);

  const divisi = useMemo(() => {
    const m = new Map();
    terfilter.forEach((i) => {
      const d = i.divisi || "Lainnya";
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(i);
    });
    return [...m.entries()].sort(
      ([namaA, a], [namaB, b]) =>
        ringkas(b).kritis - ringkas(a).kritis || String(namaA).localeCompare(String(namaB), "id")
    );
  }, [terfilter]);

  const auto = qDeferred.trim() !== "" || filter !== "semua" || !!divFilter;
  const isOpen = (d) => (auto ? true : !!open[d]);

  const segarkan = useCallback(async () => {
    if (!refresh || refreshing) return;
    setRefreshing(true);
    try {
      await refresh({ force: true });
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refreshing]);

  const restokItems = useMemo(
    () =>
      perEntitas
        .filter((i) => (!divFilter || i.divisi === divFilter) && i.min > 0 && i.stok < i.min)
        .sort((a, b) => RANK[a.status] - RANK[b.status] || a.nama.localeCompare(b.nama)),
    [perEntitas, divFilter]
  );
  const daftarRestok = useMemo(
    () =>
      restokItems.map(
        (i) => `• ${i.nama} — sisa ${fmt(i.stok)} ${i.satuan}, butuh ± ${fmt(i.min - i.stok)}`
      ),
    [restokItems]
  );

  const bagikan = async () => {
    const teks = `Daftar restok ${entitas}${divFilter ? ` · ${divFilter}` : ""} (${new Date().toLocaleDateString("id-ID")})\n${daftarRestok.join("\n")}`;
    try {
      if (navigator.share) await navigator.share({ text: teks });
      else {
        await navigator.clipboard.writeText(teks);
        setToast("Daftar restok disalin");
        setTimeout(() => setToast(""), 2000);
      }
    } catch {}
  };

  const { tampilDivisi, sisaItem } = useMemo(() => {
    let sisa = limit;
    const out = [];
    let total = 0;
    for (const pair of divisi) {
      const items = pair[1];
      total += items.length;
      if (sisa <= 0) continue;
      if (items.length <= sisa) {
        out.push(pair);
        sisa -= items.length;
      } else {
        out.push([pair[0], items.slice(0, sisa)]);
        sisa = 0;
      }
    }
    return { tampilDivisi: out, sisaItem: Math.max(0, total - limit) };
  }, [divisi, limit]);

  const kosong = !loading && semua.length === 0;

  return (
    <div className="sk-page">
      <header className="sk-head">
        <h1>Stok barang</h1>
      </header>

      <section className="sk-filter-block sk-entity-block" aria-label="Pilih entitas">
        <div className="sk-seg" role="tablist" aria-label="Entitas">
        {ENTITAS.map((e) => (
          <button key={e} type="button" role="tab" aria-selected={entitas === e} className={entitas === e ? "on" : ""} onClick={() => setEntitas(e)}>
            {e === "BB" ? "Bahan Baku" : e}

          </button>
        ))}
        </div>
      </section>

      <section className="sk-filter-block" aria-label="Pilih divisi">
        <h2 className="sk-section-label">Divisi</h2>
        <div className="sk-div-chips" role="group" aria-label="Filter divisi">
        <button type="button" className={!divFilter ? "on" : ""} onClick={() => setDivFilter(null)}>
          Semua
        </button>
        {daftarDivisi.map(({ nama, n }) => (
          <button key={nama} type="button" className={divFilter === nama ? "on" : ""} onClick={() => setDivFilter(divFilter === nama ? null : nama)}>
            {nama}
          </button>
        ))}
        </div>
      </section>

      <section className="sk-filter-block" aria-label="Filter kondisi stok">
        <div className="sk-status-row">
          <h2 className="sk-section-label">Kondisi stok</h2>
          <div className="sk-chips" role="group" aria-label="Filter status">
            {["semua", "kritis", "waspada", "aman"].map((s) => (
              <button key={s} type="button" className={`${filter === s ? "on" : ""}${s !== "semua" ? ` sk-c-${s}` : ""}`} onClick={() => setFilter(s)}>
                {s === "semua" ? "Semua" : LABEL[s]}

              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="sk-search">
        <input type="search" aria-label="Cari barang" placeholder="Cari nama atau kode barang" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" spellCheck={false} />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Hapus">✕</button>
        )}
      </div>

      {restokItems.length > 0 && (
        <div className="sk-banner">
          <div>
            <b>{restokItems.length} item perlu restok</b>
            <small>{divFilter ? `Divisi ${divFilter}` : "Semua divisi"} · {entitas}</small>
          </div>
          <button type="button" className="sk-share-outline" onClick={bagikan}>Bagikan</button>
        </div>
      )}

      {error && (
        <div className="sk-alert">
          {error}{" "}
          <button type="button" onClick={segarkan}>Coba lagi</button>
        </div>
      )}

      <div className="sk-list-head">
        <div>
          <h2>Daftar barang</h2>
          {(divFilter || filter !== "semua" || qDeferred) && <p className="sk-list-active-filter">{[divFilter, filter !== "semua" ? LABEL[filter] : null, qDeferred ? `“${qDeferred}”` : null].filter(Boolean).join(" · ")}</p> }
        </div>
        <span>{fmtCount(terfilter.length)} barang</span>
      </div>

      {loading && semua.length === 0 && (
        <div className="sk-skel">{[0, 1, 2].map((i) => <div key={i} />)}</div>
      )}

      {kosong && !error && (
        <div className="sk-empty">
          <b>Belum ada data stok</b>
          <p>Pastikan spreadsheet bulan berjalan terhubung, lalu muat ulang.</p>
          <button type="button" className="sk-primary" onClick={segarkan}>Muat ulang</button>
        </div>
      )}

      {!kosong && divisi.length === 0 && !loading && (
        <div className="sk-empty">
          <b>Tidak ada item cocok</b>
          <p>Ubah kata kunci, divisi, atau filter status.</p>
        </div>
      )}

      <div className="sk-item-list" aria-label="Daftar item stok">
        {terfilter.slice(0, limit).map((it) => (
          <ItemRow key={`${it.entitas}-${it.kode}`} it={it} onOpen={onOpenItem} />
        ))}
      </div>
      {sisaItem > 0 && (
        <button type="button" className="sk-more" onClick={() => setLimit((n) => n + BATCH)}>
          Tampilkan lebih banyak ({sisaItem} item tersisa)
        </button>
      )}

      <div className="sk-spacer" />
      <Sheet it={detail} onClose={onCloseSheet} onInput={onInput && ((i) => { setDetail(null); onInput(i); })} />
      {toast && <div className="sk-toast">{toast}</div>}
    </div>
  );
}
