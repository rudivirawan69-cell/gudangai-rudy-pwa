import { Fragment, memo, useMemo, useState, useEffect, useCallback, useDeferredValue, useRef } from "react";
import "./riwayat.css";
import { getLocalHistory, getPendingQueue } from "../data/api";
import {
  gabung, filterTx, kelompokkan, keCSV, ringkasanTeks, ringkasKatalog,
} from "../data/riwayatAdapter.js";

/**
 * RiwayatPage — redesain + optimasi performa
 * - Debounce pencarian (deferred)
 * - Satu lintasan ringkasKatalog
 * - Cache jam/hari/haystack di adapter
 * - memo(Baris), callback stabil
 * - Paginasi 40
 */

const TIPE_LABEL = { masuk: "Masuk", keluar: "Keluar", rusak: "Rusak" };
const ARAH = { masuk: "↓", keluar: "↑", rusak: "!" };
const STATUS_LABEL = { terkirim: "Terkirim", antrian: "Antrian", gagal: "Gagal", lokal: "Lokal" };
const ENT = ["semua", "CV", "PT", "Bahan Baku"];
const TIPE_FILTERS = [
  { id: "semua", label: "Semua" },
  { id: "masuk", label: "Masuk" },
  { id: "keluar", label: "Keluar" },
  { id: "rusak", label: "Rusak" },
];
const STATUS_FILTERS = ["semua", "terkirim", "antrian", "gagal", "lokal"];
const DENSITY_KEY = "gudangai:riwayat:density:v1";
const BATCH = 40;
const EMPTY = [];

const fmt = (n) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);
const fmtCount = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

function judul(t) {
  const a = t.items[0];
  const nama = a?.nama || a?.kode || "(tanpa nama)";
  return t.jumlahItem > 1 ? `${nama} +${fmtCount(t.jumlahItem - 1)} lainnya` : nama;
}

const Baris = memo(function Baris({ t, buka, onToggle, onRetry, onCopy, ringkas }) {
  return (
    <article className={`rw-row rw-${t.tipe}${buka ? " is-open" : ""}${ringkas ? " is-compact" : ""}`}>
      <button type="button" className="rw-row-head" onClick={onToggle} aria-expanded={buka} data-id={t.id}>
        <span className="rw-ico" aria-hidden="true">{ARAH[t.tipe] || "·"}</span>
        <span className="rw-main">
          <b>{judul(t)}</b>
          <small>
            {TIPE_LABEL[t.tipe] || t.tipe || "?"} · {t.entitas ?? "?"} · {fmt(t.totalQty)} total ·{" "}
            {t.jamLabel || "--.--"}
          </small>
        </span>
        <span className={`rw-pill rw-s-${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span>
      </button>
      {buka && (
        <div className="rw-detail">
          <ul>
            {(t.items || EMPTY).map((i, n) => (
              <li key={n}>
                <span>
                  {i.nama || i.kode}
                  {i.kode && i.nama ? <em> · {i.kode}</em> : null}
                </span>
                <b>
                  {fmt(i.qty)} {i.satuan || ""}
                </b>
              </li>
            ))}
          </ul>
          {t.keterangan ? <p className="rw-ket">{t.keterangan}</p> : null}
          <div className="rw-actions">
            <button type="button" onClick={() => onCopy(t)}>
              Salin
            </button>
            {onRetry && (t.status === "gagal" || t.status === "antrian") && (
              <button type="button" className="rw-primary" onClick={() => onRetry(t)}>
                Kirim ulang
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
});

export default function RiwayatPage({ onNavigate }) {
  const [tick, setTick] = useState(0);
  const [tipe, setTipe] = useState("semua");
  const [entitas, setEntitas] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [q, setQ] = useState("");
  const qDeferred = useDeferredValue(q);
  const [openId, setOpenId] = useState(null);
  const [limit, setLimit] = useState(BATCH);
  const [ringkas, setRingkas] = useState(() => {
    try {
      return localStorage.getItem(DENSITY_KEY) === "compact";
    } catch {
      return true;
    }
  });
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const local = useMemo(() => {
    try {
      return getLocalHistory() || EMPTY;
    } catch {
      return EMPTY;
    }
  }, [tick]);

  const queueCount = useMemo(() => {
    try {
      return (getPendingQueue() || EMPTY).length;
    } catch {
      return 0;
    }
  }, [tick]);

  const onRefresh = useCallback(() => setTick((n) => n + 1), []);

  const onOpenQueue = useCallback(() => onNavigate?.("sync"), [onNavigate]);

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, ringkas ? "compact" : "comfortable");
    } catch {}
  }, [ringkas]);

  useEffect(() => {
    setLimit(BATCH);
    setOpenId(null);
  }, [tipe, entitas, status, qDeferred]);

  useEffect(() => {
    const refreshHistory = () => setTick((n) => n + 1);
    window.addEventListener('gudangai-history-changed', refreshHistory);
    window.addEventListener('gudangai-queue-changed', refreshHistory);
    return () => {
      window.removeEventListener('gudangai-history-changed', refreshHistory);
      window.removeEventListener('gudangai-queue-changed', refreshHistory);
    };
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  const data = useMemo(() => gabung(local, EMPTY), [local]);
  const filtered = useMemo(
    () => filterTx(data, { tipe, entitas, status, q: qDeferred }),
    [data, tipe, entitas, status, qDeferred]
  );
  const groups = useMemo(() => kelompokkan(filtered), [filtered]);
  const stats = useMemo(() => ringkasKatalog(data), [data]);

  const tampil = useMemo(() => {
    let sisa = limit;
    const out = [];
    for (const g of groups) {
      if (sisa <= 0) break;
      if (g.items.length <= sisa) {
        out.push(g);
        sisa -= g.items.length;
      } else {
        out.push({ ...g, items: g.items.slice(0, sisa) });
        sisa = 0;
      }
    }
    return out;
  }, [groups, limit]);

  const totalFiltered = filtered.length;
  const sisaItem = Math.max(0, totalFiltered - limit);
  const adaFilter = tipe !== "semua" || entitas !== "semua" || status !== "semua" || qDeferred.trim() !== "";

  const onToggle = useCallback((id) => {
    setOpenId((cur) => (cur === id ? null : id));
  }, []);

  const onCopy = useCallback(async (t) => {
    const teks = ringkasanTeks(t);
    try {
      await navigator.clipboard.writeText(teks);
      showToast("Disalin");
    } catch {
      showToast("Gagal salin");
    }
  }, [showToast]);

  const onExport = useCallback(() => {
    try {
      const csv = keCSV(filtered);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `riwayat-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("CSV diunduh");
    } catch {
      showToast("Gagal unduh");
    }
  }, [filtered, showToast]);

  return (
    <div className="rw-page">
      <header className="rw-head">
        <div>
          <h1>Riwayat Transaksi</h1>
        </div>
        <div className="rw-head-actions">
          <button type="button" className="rw-btn-ghost" onClick={onRefresh} aria-label="Muat ulang">
            ↻
          </button>
          <button type="button" className="rw-btn-ghost" onClick={onExport} aria-label="Unduh CSV">
            CSV
          </button>
          <button
            type="button"
            className={`rw-btn-ghost${ringkas ? " is-on" : ""}`}
            onClick={() => setRingkas((v) => !v)}
            aria-pressed={ringkas}
          >
            {ringkas ? "Padat" : "Longgar"}
          </button>
        </div>
      </header>

      {queueCount > 0 && (
        <button type="button" className="rw-queue-banner" onClick={onOpenQueue}>
          <b>{queueCount} antrian sinkronisasi</b>
          <span>Buka</span>
        </button>
      )}

      <div className="rw-search">
        <input
          type="search"
          placeholder="Cari nama, kode, atau keterangan"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Cari transaksi"
          autoComplete="off"
          spellCheck={false}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Hapus">
            ✕
          </button>
        )}
      </div>

      <section className="rw-filters" aria-label="Filter riwayat">
        <div>
          <div className="rw-chips" role="group" aria-label="Jenis transaksi">
            {TIPE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={tipe === f.id ? "on" : ""}
                onClick={() => setTipe(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="rw-chips" role="group" aria-label="Entitas">
            {ENT.map((e) => (
              <button
                key={e}
                type="button"
                className={entitas === e ? "on" : ""}
                onClick={() => setEntitas(e)}
              >
                {e === "semua" ? "Semua" : e}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="rw-chips" role="group" aria-label="Status pengiriman">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                className={status === s ? "on" : ""}
                onClick={() => setStatus(s)}
              >
                {s === "semua" ? "Semua" : STATUS_LABEL[s] || s}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="rw-list-meta">
        <span>{fmtCount(totalFiltered)} transaksi</span>
      </div>

      {totalFiltered === 0 && (
        <div className="rw-empty">
          <b>{adaFilter ? "Tidak ada hasil" : "Belum ada riwayat"}</b>
        </div>
      )}

      <div className="rw-list" aria-label="Daftar transaksi">
        {tampil.map((g) => (
          <Fragment key={g.key}>
            <div className="rw-day-label">{g.label}</div>
            {g.items.map((t) => (
              <Baris
                key={t.id}
                t={t}
                buka={openId === t.id}
                onToggle={() => onToggle(t.id)}
                onCopy={onCopy}
                ringkas={ringkas}
              />
            ))}
          </Fragment>
        ))}
      </div>

      {sisaItem > 0 && (
        <button type="button" className="rw-more" onClick={() => setLimit((n) => n + BATCH)}>
          Tampilkan lebih banyak ({sisaItem} tersisa)
        </button>
      )}

      <div className="rw-spacer" />
      {toast && <div className="rw-toast">{toast}</div>}
    </div>
  );
}
