import { useMemo, useState, useEffect, useCallback } from "react";
import "./stok.css";
import { useStock } from "../hooks/useStock";
import { ENTITAS, TIDAK_TERKLASIFIKASI, normalizeAll } from "../data/stokAdapter.js";

/**
 * StokPage — redesain v2.1
 * - Tanpa 4 kartu KPI
 * - Chip divisi di bagian atas (filter utama)
 * - Ringkasan status satu baris + chip filter status sekunder
 */

const RANK = { kritis: 0, waspada: 1, aman: 2 };
const LABEL = { kritis: "Kritis", waspada: "Waspada", aman: "Aman" };
const CACHE_KEY = "gudangai:stok:snapshot:v1";
const STALE_MENIT = 10;

const fmt = (n) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

function relatif(ts) {
  if (!ts) return null;
  const d = new Date(ts).getTime();
  if (!d) return null;
  const m = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const j = Math.round(m / 60);
  if (j < 24) return `${j} jam lalu`;
  return `${Math.round(j / 24)} hari lalu`;
}

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

function ItemRow({ it, onOpen }) {
  const target = it.min > 0 ? it.min : null;
  const pct = target ? Math.min(100, Math.round((it.stok / target) * 100)) : 0;
  return (
    <button type="button" className="sk-item" onClick={() => onOpen(it)}>
      <div className="sk-item-main">
        <span className="sk-item-nama">{it.nama}</span>
        <span className="sk-item-kode">{it.kode}</span>
      </div>
      <div className="sk-item-qty">
        <b>{fmt(it.stok)}</b>
        <small>{it.satuan}</small>
      </div>
      <span className={`sk-dot sk-${it.status}`} title={LABEL[it.status]} />
      {target && (
        <div className="sk-meter">
          <i className={`sk-${it.status}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </button>
  );
}

function Divisi({ nama, items, open, onToggle, onOpen }) {
  const c = ringkas(items);
  return (
    <section className={`sk-div${open ? " is-open" : ""}`}>
      <button type="button" className="sk-div-head" onClick={onToggle} aria-expanded={open}>
        <div className="sk-div-title">
          <h3>{nama}</h3>
          <p>
            {c.total} item
            {c.kritis > 0 && <span className="t-kritis"> · {c.kritis} kritis</span>}
            {c.waspada > 0 && <span className="t-waspada"> · {c.waspada} waspada</span>}
          </p>
          <Bar c={c} />
        </div>
        <span className="sk-chev" aria-hidden="true">›</span>
      </button>
      {open && (
        <div className="sk-div-body">
          {items.map((it) => (
            <ItemRow key={`${it.entitas}-${it.kode}-${it.nama}`} it={it} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
}

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
  const [open, setOpen] = useState({});
  const [detail, setDetail] = useState(null);
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

  const memakaiCache = !(rawItems && rawItems.length) && cache?.data?.length;
  const sumber = memakaiCache ? cache.data : rawItems || [];
  const waktu = memakaiCache ? cache.at : lastRefresh;

  const { items: semua, laporan } = useMemo(
    () => normalizeAll(sumber, { targetTotal: 193 }),
    [sumber]
  );
  const perEntitas = useMemo(
    () => semua.filter((i) => i.entitas === entitas),
    [semua, entitas]
  );
  const cnt = useMemo(() => ringkas(perEntitas), [perEntitas]);
  const tabs = useMemo(
    () => (laporan.tanpaEntitas > 0 ? [...ENTITAS, TIDAK_TERKLASIFIKASI] : ENTITAS),
    [laporan.tanpaEntitas]
  );
  const cntEnt = useMemo(
    () => Object.fromEntries(tabs.map((e) => [e, semua.filter((i) => i.entitas === e).length])),
    [semua, tabs]
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
    const k = q.trim().toLowerCase();
    return perEntitas
      .filter((i) => !divFilter || i.divisi === divFilter)
      .filter((i) => filter === "semua" || i.status === filter)
      .filter((i) => !k || i.nama.toLowerCase().includes(k) || String(i.kode).toLowerCase().includes(k))
      .sort((a, b) => RANK[a.status] - RANK[b.status] || a.nama.localeCompare(b.nama));
  }, [perEntitas, divFilter, filter, q]);

  const divisi = useMemo(() => {
    const m = new Map();
    terfilter.forEach((i) => m.set(i.divisi, [...(m.get(i.divisi) || []), i]));
    return [...m.entries()].sort(
      ([, a], [, b]) => ringkas(b).kritis - ringkas(a).kritis || a[0].divisi.localeCompare(b[0].divisi)
    );
  }, [terfilter]);

  const auto = q.trim() !== "" || filter !== "semua" || !!divFilter;
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

  const rel = relatif(waktu);
  const basi = !waktu || Date.now() - new Date(waktu).getTime() > STALE_MENIT * 60000;
  const kosong = !loading && semua.length === 0;
  const koneksi = memakaiCache ? "offline" : error ? "gagal" : kosong ? "kosong" : basi ? "basi" : "ok";
  const teksKoneksi = {
    ok: `Tersinkron · ${rel}`,
    basi: `Data ${rel || "belum ada"}`,
    offline: `Offline · data ${rel}`,
    kosong: "Belum ada data dari spreadsheet",
    gagal: "Gagal memuat data",
  }[koneksi];

  return (
    <div className="sk-page">
      <div className={`sk-conn sk-c-${koneksi}`}>
        <span className="sk-conn-dot" />
        <span className="sk-conn-txt">{teksKoneksi}</span>
        <button
          type="button"
          className={`sk-refresh${refreshing || loading ? " spin" : ""}`}
          onClick={segarkan}
          aria-label="Muat ulang data"
        >
          ⟳
        </button>
      </div>

      <header className="sk-head">
        <div>
          <small>Monitoring persediaan</small>
          <h1>Data Stok</h1>
        </div>
      </header>

      <div className="sk-seg" role="tablist">
        {tabs.map((e) => (
          <button
            key={e}
            role="tab"
            aria-selected={entitas === e}
            className={entitas === e ? "on" : ""}
            onClick={() => setEntitas(e)}
          >
            {e} <em>{cntEnt[e]}</em>
          </button>
        ))}
      </div>

      {daftarDivisi.length > 0 && (
        <div className="sk-div-chips" role="group" aria-label="Filter divisi">
          <button
            type="button"
            className={!divFilter ? "on" : ""}
            onClick={() => setDivFilter(null)}
          >
            Semua <em>{perEntitas.length}</em>
          </button>
          {daftarDivisi.map(({ nama, n }) => (
            <button
              key={nama}
              type="button"
              className={divFilter === nama ? "on" : ""}
              onClick={() => setDivFilter(divFilter === nama ? null : nama)}
            >
              {nama} <em>{n}</em>
            </button>
          ))}
        </div>
      )}

      <div className="sk-status-row">
        <p className="sk-status-sum">
          <span className="t-kritis">{cnt.kritis} kritis</span>
          <span aria-hidden="true"> · </span>
          <span className="t-waspada">{cnt.waspada} waspada</span>
          <span aria-hidden="true"> · </span>
          <span className="t-aman">{cnt.aman} aman</span>
          <span className="sk-status-total"> · {cnt.total} total</span>
        </p>
        <div className="sk-status-chips" role="group" aria-label="Filter status">
          {[
            { id: "semua", label: "Semua" },
            { id: "kritis", label: "Kritis" },
            { id: "waspada", label: "Waspada" },
            { id: "aman", label: "Aman" },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              className={filter === s.id ? "on" : ""}
              onClick={() => setFilter(filter === s.id && s.id !== "semua" ? "semua" : s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sk-search">
        <input
          type="search"
          inputMode="search"
          placeholder="Cari kode / nama…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Hapus pencarian">
            ✕
          </button>
        )}
      </div>

      {daftarRestok.length > 0 && filter === "semua" && !q && (
        <div className="sk-restok">
          <div>
            <b>{daftarRestok.length} item di bawah stok aman</b>
            <small>
              {restokItems.filter((i) => i.status === "kritis").length} kritis ·{" "}
              {restokItems.filter((i) => i.status === "waspada").length} waspada
            </small>
          </div>
          <button type="button" onClick={bagikan}>
            Bagikan
          </button>
        </div>
      )}

      {(laporan.hanyaAwal > 0 ||
        laporan.tanpaEntitas > 0 ||
        laporan.duplikat.length > 0 ||
        laporan.statusBeda > 0 ||
        (laporan.selisihTarget != null && laporan.selisihTarget !== 0)) && (
        <div className="sk-alert">
          Data perlu dicek:
          {laporan.hanyaAwal > 0 && ` ${laporan.hanyaAwal} item hanya punya Stock Awal (bukan sisa).`}
          {laporan.tanpaEntitas > 0 &&
            ` ${laporan.tanpaEntitas} item belum terklasifikasi (lihat tab "Tidak terklasifikasi").`}
          {laporan.duplikat.length > 0 &&
            ` ${laporan.duplikat.length} baris duplikat diabaikan (entri pertama dipakai).`}
          {laporan.statusBeda > 0 &&
            ` ${laporan.statusBeda} status API berbeda dari aturan Dashboard.`}
          {laporan.selisihTarget != null &&
            laporan.selisihTarget !== 0 &&
            ` Total unik ${laporan.total} (target 193, selisih ${laporan.selisihTarget > 0 ? "+" : ""}${laporan.selisihTarget}).`}
        </div>
      )}

      {error && (
        <div className="sk-alert">
          {error}{" "}
          <button type="button" onClick={segarkan}>
            Coba lagi
          </button>
        </div>
      )}

      <div className="sk-list-head">
        <h2>
          {divFilter || "Semua divisi"} · {entitas}
        </h2>
        <span>{divisi.length} grup</span>
        {!auto && divisi.length > 0 && (
          <button
            type="button"
            onClick={() => {
              const semuaTerbuka = divisi.every(([d]) => open[d]);
              setOpen(Object.fromEntries(divisi.map(([d]) => [d, !semuaTerbuka])));
            }}
          >
            {divisi.every(([d]) => open[d]) ? "Tutup semua" : "Buka semua"}
          </button>
        )}
      </div>

      {loading && semua.length === 0 && (
        <div className="sk-skel">
          {[0, 1, 2].map((i) => (
            <div key={i} />
          ))}
        </div>
      )}

      {kosong && !error && (
        <div className="sk-empty">
          <b>Belum ada data stok</b>
          <p>Pastikan spreadsheet bulan berjalan terhubung, lalu muat ulang.</p>
          <button type="button" className="sk-primary" onClick={segarkan}>
            Muat ulang
          </button>
        </div>
      )}

      {!kosong && divisi.length === 0 && !loading && (
        <div className="sk-empty">
          <b>Tidak ada item cocok</b>
          <p>Ubah kata kunci, divisi, atau filter status.</p>
        </div>
      )}

      {divisi.map(([nama, items]) => (
        <Divisi
          key={nama}
          nama={nama}
          items={items}
          open={isOpen(nama)}
          onToggle={() => setOpen((o) => ({ ...o, [nama]: !o[nama] }))}
          onOpen={setDetail}
        />
      ))}

      <div className="sk-spacer" />
      <Sheet
        it={detail}
        onClose={() => setDetail(null)}
        onInput={
          onInput &&
          ((i) => {
            setDetail(null);
            onInput(i);
          })
        }
      />
      {toast && <div className="sk-toast">{toast}</div>}
    </div>
  );
}
