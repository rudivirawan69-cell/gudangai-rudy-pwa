import React, { Fragment, memo, useMemo, useState, useEffect, useCallback, useDeferredValue, useRef } from "react";
import "./riwayat.css";
import { getLocalHistory, getPendingQueue, fetchRemoteTransactionHistory } from "../data/api";
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
const STATUS_LABEL = { terkirim: "Terkirim", antrian: "Antrean", gagal: "Gagal", lokal: "Lokal" };
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
  const [remote, setRemote] = useState(EMPTY);
  const [tipe, setTipe] = useState("semua");
  const [entitas, setEntitas] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [q, setQ] = useState("");
  const qDeferred = useDeferredValue(q);
  const [openId, setOpenId] = useState(null);
  const [openFilter, setOpenFilter] = useState(null); // null | 'tipe' | 'entitas' | 'status'
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

  useEffect(() => {
    let active = true;
    fetchRemoteTransactionHistory(31)
      .then((rows) => { if (active) setRemote(Array.isArray(rows) ? rows : EMPTY); })
      .catch(() => { if (active) setRemote(EMPTY); });
    return () => { active = false; };
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

  const semua = useMemo(() => gabung(local, remote), [local, remote]);

  const katalog = useMemo(() => ringkasKatalog(semua), [semua]);
  const cntStatus = katalog.status;
  const cntTipe = katalog.tipe;
  const anomaliTotal = katalog.anomali;

  const tersaring = useMemo(
    () => filterTx(semua, { tipe, entitas, status, q: qDeferred }),
    [semua, tipe, entitas, status, qDeferred]
  );

  const { hari, anomali: listAnomali } = useMemo(() => kelompokkan(tersaring), [tersaring]);
  const anomali = listAnomali.length || anomaliTotal;

  const totalValid = useMemo(
    () => hari.reduce((a, h) => a + h.items.length, 0),
    [hari]
  );

  const tampil = useMemo(() => {
    let sisa = limit;
    const out = [];
    for (let i = 0; i < hari.length && sisa > 0; i++) {
      const h = hari[i];
      if (sisa >= h.items.length) {
        out.push(h);
        sisa -= h.items.length;
      } else {
        out.push({ ...h, items: h.items.slice(0, sisa) });
        sisa = 0;
      }
    }
    return out;
  }, [hari, limit]);

  const nAntrean = queueCount || cntStatus.antrian || 0;
  const adaFilter = tipe !== "semua" || entitas !== "semua" || status !== "semua" || q.trim() !== "";

  const info = useCallback((t) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2000);
  }, []);

  const salin = useCallback(
    async (t) => {
      try {
        await navigator.clipboard.writeText(ringkasanTeks(t));
        info("Disalin");
      } catch {
        info("Gagal menyalin");
      }
    },
    [info]
  );

  const onToggle = useCallback((e) => {
    const id = e.currentTarget?.dataset?.id;
    if (!id) return;
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const ekspor = useCallback(() => {
    const csv = keCSV(tersaring);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riwayat-gudangai-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    info("CSV diunduh");
  }, [tersaring, info]);

  const resetFilter = useCallback(() => {
    setTipe("semua");
    setEntitas("semua");
    setStatus("semua");
    setQ("");
  }, []);

  const more = useCallback(() => setLimit((n) => n + BATCH), []);

  return (
    <div className="rw-page">
      <header className="rw-head">
        <div>

          <h1>Riwayat Transaksi</h1>
            {totalValid > 0 && (
              <p className="rw-sub">
                {fmtCount(totalValid)} transaksi{anomali > 0 ? ` · ${fmtCount(anomali)} invalid` : ""}
              </p>
            )}
        </div>
        <div className="rw-head-actions">
          {nAntrean > 0 && (
            <button type="button" className="rw-btn-queue" onClick={onOpenQueue}>
              Antrean {nAntrean}
            </button>
          )}
          <button
            type="button"
            className="rw-btn-ghost"
            onClick={() => setRingkas((v) => !v)}
            aria-pressed={ringkas}
          >
            {ringkas ? "Nyaman" : "Ringkas"}
          </button>
          <button type="button" className="rw-btn-ghost" onClick={onRefresh} aria-label="Muat ulang">
            ⟳
          </button>
        </div>
      </header>

      {(cntStatus.gagal > 0 || cntStatus.antrian > 0) && status === "semua" && (
        <div className="rw-banner">
          <div>
            <b>
              {cntStatus.gagal > 0 ? `${cntStatus.gagal} gagal` : ""}
              {cntStatus.gagal > 0 && cntStatus.antrian > 0 ? " · " : ""}
              {cntStatus.antrian > 0 ? `${cntStatus.antrian} antrian` : ""}
            </b>
            <small>Filter atau buka Antrean Sinkronisasi</small>
          </div>
          <div className="rw-banner-btns">
            {cntStatus.gagal > 0 && (
              <button type="button" onClick={() => setStatus("gagal")}>
                Lihat gagal
              </button>
            )}
            {nAntrean > 0 && (
              <button type="button" className="rw-primary" onClick={onOpenQueue}>
                Antrean
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rw-filters-row" role="group" aria-label="Filter transaksi">
        <section className={`rw-filter-group${openFilter === "tipe" ? " is-open" : ""}`} aria-label="Filter jenis transaksi">
          <button
            type="button"
            className="rw-filter-head"
            onClick={() => setOpenFilter((v) => (v === "tipe" ? null : "tipe"))}
            aria-expanded={openFilter === "tipe"}
          >
            <h2>Jenis transaksi</h2>
            <span className="rw-filter-chevron" aria-hidden="true">{openFilter === "tipe" ? "▾" : "▸"}</span>
          </button>
          {openFilter === "tipe" && (
            <div className="rw-chips" role="group" aria-label="Jenis transaksi">
              {TIPE_FILTERS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={tipe === x.id ? "on" : ""}
                  onClick={() => setTipe(x.id)}
                >
                  {x.label}
                  {x.id !== "semua" && cntTipe[x.id] != null ? <em>{fmtCount(cntTipe[x.id])}</em> : null}
                </button>
              ))}
            </div>
          )}
        </section>
        <section className={`rw-filter-group${openFilter === "entitas" ? " is-open" : ""}`} aria-label="Filter entitas">
          <button
            type="button"
            className="rw-filter-head"
            onClick={() => setOpenFilter((v) => (v === "entitas" ? null : "entitas"))}
            aria-expanded={openFilter === "entitas"}
          >
            <h2>Entitas</h2>
            <span className="rw-filter-chevron" aria-hidden="true">{openFilter === "entitas" ? "▾" : "▸"}</span>
          </button>
          {openFilter === "entitas" && (
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
          )}
        </section>
        <section className={`rw-filter-group${openFilter === "status" ? " is-open" : ""}`} aria-label="Filter status pengiriman">
          <button
            type="button"
            className="rw-filter-head"
            onClick={() => setOpenFilter((v) => (v === "status" ? null : "status"))}
            aria-expanded={openFilter === "status"}
          >
            <h2>Status</h2>
            <span className="rw-filter-chevron" aria-hidden="true">{openFilter === "status" ? "▾" : "▸"}</span>
          </button>
          {openFilter === "status" && (
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
          )}
        </section>
      </div>

      <div className="rw-search">
        <input
          type="search"
          aria-label="Cari transaksi"
          placeholder="Cari kode, nama, atau keterangan…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Hapus">
            ✕
          </button>
        )}
        <button type="button" className="rw-btn-ghost rw-btn-export" onClick={ekspor} title="Ekspor CSV">
          CSV
        </button>
      </div>

      {anomali > 0 && (
        <div className="rw-alert rw-soft">
          {anomali} entri tidak valid disembunyikan (qty 0 / tanpa item). Tidak dihapus dari perangkat.
        </div>
      )}

      {totalValid === 0 && (
        <div className="rw-empty">
          <b>{adaFilter ? "Tidak ada hasil" : "Belum ada riwayat"}</b>
          {adaFilter ? (
            <button type="button" className="rw-primary" onClick={resetFilter}>Reset filter</button>
          ) : (
            <button type="button" className="rw-primary" onClick={() => onNavigate?.("input")}>Buat input baru</button>
          )}
        </div>
      )}

      <div className="rw-audit-table-wrap" aria-label="Tabel audit riwayat transaksi">
        <table className="rw-audit-table">
          <thead>
            <tr><th>Tanggal</th><th>Waktu</th><th>Jenis / item</th><th>Entitas</th><th>Jumlah</th><th>Status</th></tr>
          </thead>
          <tbody>
            {tersaring.slice(0, limit).map((t) => (
              <Fragment key={t.id}>
                <tr key={t.id}>
                  <td>{t.hariKey === "tanpa-tanggal" ? "—" : t.hariKey}</td>
                  <td>{t.jamLabel || "—"}</td>
                  <td>
                    <button type="button" className="rw-audit-open" aria-expanded={openId === t.id} onClick={() => setOpenId((prev) => prev === t.id ? null : t.id)}>
                      {TIPE_LABEL[t.tipe] || t.tipe || "Transaksi"} · {judul(t)}
                      <small>{t.jumlahItem} item · buka detail</small>
                    </button>
                  </td>
                  <td>{t.entitas || "—"}</td>
                  <td className="rw-audit-qty">{fmt(t.totalQty)}</td>
                  <td><span className={`rw-pill rw-s-${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span></td>
                </tr>
                {openId === t.id && (
                  <tr key={`${t.id}-detail`} className="rw-audit-detail">
                    <td colSpan={6}>
                      <div className="rw-detail">
                        <ul>{(t.items || EMPTY).map((item, index) => <li key={index}><span>{item.nama || item.kode}{item.kode && item.nama ? <em> · {item.kode}</em> : null}</span><b>{fmt(item.qty)} {item.satuan || ""}</b></li>)}</ul>
                        {t.keterangan ? <p className="rw-ket">{t.keterangan}</p> : null}
                        <div className="rw-actions"><button type="button" onClick={() => salin(t)}>Salin ringkasan</button></div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {tampil.map((h) => (
        <section key={h.key} className="rw-day">
          <header className="rw-day-head">
            <h2>{h.label}</h2>
            <span>
              {h.items.length} tx · ↓{h.ringkas?.masuk || 0} ↑{h.ringkas?.keluar || 0}
              {(h.ringkas?.rusak || 0) > 0 ? ` !${h.ringkas.rusak}` : ""}
            </span>
          </header>
          {h.items.map((t) => (
            <Baris
              key={t.id}
              t={t}
              buka={openId === t.id}
              onToggle={onToggle}
              onRetry={undefined}
              onCopy={salin}
              ringkas={ringkas}
            />
          ))}
        </section>
      ))}

      {totalValid > limit && (
        <button type="button" className="rw-more" onClick={more}>
          Tampilkan lebih banyak ({totalValid - limit} tersisa)
        </button>
      )}

      <div className="rw-spacer" />
      {toast && <div className="rw-toast">{toast}</div>}
    </div>
  );
}
