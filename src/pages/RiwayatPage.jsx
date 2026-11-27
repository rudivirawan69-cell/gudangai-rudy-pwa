import React, { memo, useMemo, useState, useEffect, useCallback, useDeferredValue, useRef, startTransition } from "react";
import "./riwayat.css";
import { ArrowLeftRight, Building2, CircleCheck, RefreshCw, CalendarDays, ChevronDown } from "lucide-react";
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
 * - Paginasi per tanggal
 * - DayGroup memo + startTransition + content-visibility (2026-11-26)
 */

const TIPE_LABEL = { masuk: "Masuk", keluar: "Keluar", rusak: "Rusak" };
const STATUS_LABEL = { terkirim: "Terkirim", antrian: "Antrean", gagal: "Gagal", lokal: "Lokal" };
const ENT = ["semua", "CV", "PT", "Bahan Baku"];
const TIPE_FILTERS = [
  { id: "semua", label: "Semua" },
  { id: "masuk", label: "Masuk" },
  { id: "keluar", label: "Keluar" },
  { id: "rusak", label: "Rusak" },
];
const STATUS_FILTERS = ["semua", "terkirim", "antrian", "gagal", "lokal"];
const BATCH = 10;
const EMPTY = [];

const fmt = (n) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);
const fmtCount = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n);

function judul(t) {
  const a = t.items[0];
  const nama = a?.nama || a?.kode || "(tanpa nama)";
  return t.jumlahItem > 1 ? `${nama} +${fmtCount(t.jumlahItem - 1)} lainnya` : nama;
}

const TransactionCard = memo(function TransactionCard({ tx, onCopy }) {
  return (
    <article className="rw-tx-detail">
      <header className="rw-tx-detail-head">
        <span className={"rw-tx-type rw-" + tx.tipe}>{TIPE_LABEL[tx.tipe] || tx.tipe || "Transaksi"}</span>
        <strong>{tx.jamLabel || "Waktu tidak tercatat"}</strong>
        <span className={"rw-pill rw-s-" + tx.status}>{STATUS_LABEL[tx.status] || tx.status}</span>
      </header>
      <div className="rw-tx-detail-meta">
        <span>Entitas: <b>{tx.entitas || "—"}</b></span>
        <span>{fmtCount(tx.jumlahItem)} item · {fmt(tx.totalQty)} total qty</span>
      </div>
      <ul className="rw-tx-items">
        {(tx.items || EMPTY).map((item, index) => (
          <li key={tx.id + "-" + index}>
            <span><b>{item.nama || item.kode || "Item tanpa nama"}</b>{item.kode && item.nama ? <small>{item.kode}</small> : null}</span>
            <strong>{fmt(item.qty)} {item.satuan || ""}</strong>
          </li>
        ))}
      </ul>
      {tx.keterangan ? <p className="rw-ket">Keterangan: {tx.keterangan}</p> : null}
      <div className="rw-actions"><button type="button" onClick={() => onCopy(tx)}>Salin transaksi</button></div>
    </article>
  );
});

const DayGroup = memo(function DayGroup({ h, open, onToggleDay, onCopy }) {
  const handleToggle = useCallback(() => onToggleDay(h.key), [onToggleDay, h.key]);
  const first = h.items[0];
  const otherCount = Math.max(0, h.items.length - 1);
  const lineCount = h.items.reduce((sum, tx) => sum + tx.jumlahItem, 0);
  const totalQty = h.items.reduce((sum, tx) => sum + tx.totalQty, 0);
  return (
    <section className={"rw-day" + (open ? " is-open" : "")}>
      <button type="button" className="rw-day-summary" onClick={handleToggle} aria-expanded={open}>
        <CalendarDays className="rw-day-summary-icon" aria-hidden="true" />
        <span className="rw-day-summary-main">
          <strong>{h.label}</strong>
          <span>{first ? (first.items[0]?.nama || first.items[0]?.kode || TIPE_LABEL[first.tipe] || "Transaksi") : "Transaksi"}</span>
          <small>{fmtCount(h.items.length)} transaksi{otherCount ? " · +" + fmtCount(otherCount) + " transaksi lainnya" : ""}</small>
        </span>
        <span className="rw-day-summary-meta">
          <b>{fmt(totalQty)}</b>
          <small>{fmtCount(lineCount)} item</small>
          <ChevronDown className={"rw-day-chevron" + (open ? " is-open" : "")} aria-hidden="true" />
        </span>
      </button>
      {open && (
        <div className="rw-day-details">
          <div className="rw-day-details-head">
            <strong>Rincian {fmtCount(h.items.length)} transaksi</strong>
            <span>{fmtCount(lineCount)} baris item · {fmt(totalQty)} total qty</span>
          </div>
          {h.items.map((tx) => <TransactionCard key={tx.id} tx={tx} onCopy={onCopy} />)}
        </div>
      )}
    </section>
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
  const [openDayKey, setOpenDayKey] = useState(null);
  const [openFilter, setOpenFilter] = useState(null);
  const [limit, setLimit] = useState(BATCH);
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

  const onRefresh = useCallback(() => startTransition(() => setTick((n) => n + 1)), []);

  const onOpenQueue = useCallback(() => onNavigate?.("sync"), [onNavigate]);

  const setTipeSafe = useCallback((v) => startTransition(() => setTipe(v)), []);
  const setEntitasSafe = useCallback((v) => startTransition(() => setEntitas(v)), []);
  const setStatusSafe = useCallback((v) => startTransition(() => setStatus(v)), []);
  const moreSafe = useCallback(() => startTransition(() => setLimit((n) => n + BATCH)), []);
  const toggleDay = useCallback((key) => setOpenDayKey((current) => current === key ? null : key), []);

  useEffect(() => {
    setLimit(BATCH);
    setOpenDayKey(null);
  }, [tipe, entitas, status, qDeferred]);

  useEffect(() => {
    const refreshHistory = () => setTick((n) => n + 1);
    window.addEventListener("gudangai-history-changed", refreshHistory);
    window.addEventListener("gudangai-queue-changed", refreshHistory);
    return () => {
      window.removeEventListener("gudangai-history-changed", refreshHistory);
      window.removeEventListener("gudangai-queue-changed", refreshHistory);
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

  const { hari, anomali: listAnomali, totalValid: totalFromGroup } = useMemo(
    () => kelompokkan(tersaring),
    [tersaring]
  );
  const anomali = listAnomali.length || anomaliTotal;
  const totalValid = totalFromGroup ?? 0;

  const tampil = useMemo(() => hari.slice(0, limit), [hari, limit]);

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
    startTransition(() => {
      setTipe("semua");
      setEntitas("semua");
      setStatus("semua");
      setQ("");
    });
  }, []);

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
              <button type="button" onClick={() => setStatusSafe("gagal")}>
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
            <ArrowLeftRight className="rw-filter-icon" aria-hidden="true" /><h2>Transaksi</h2>
            <ChevronDown className={"rw-filter-chevron" + (openFilter === "tipe" ? " is-open" : "")} aria-hidden="true" />
          </button>
          {openFilter === "tipe" && (
            <div className="rw-chips" role="group" aria-label="Jenis transaksi">
              {TIPE_FILTERS.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  className={tipe === x.id ? "on" : ""}
                  onClick={() => setTipeSafe(x.id)}
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
            <Building2 className="rw-filter-icon" aria-hidden="true" /><h2>Entitas</h2>
            <ChevronDown className={"rw-filter-chevron" + (openFilter === "entitas" ? " is-open" : "")} aria-hidden="true" />
          </button>
          {openFilter === "entitas" && (
            <div className="rw-chips" role="group" aria-label="Entitas">
              {ENT.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={entitas === e ? "on" : ""}
                  onClick={() => setEntitasSafe(e)}
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
            <CircleCheck className="rw-filter-icon" aria-hidden="true" /><h2>Status</h2>
            <ChevronDown className={"rw-filter-chevron" + (openFilter === "status" ? " is-open" : "")} aria-hidden="true" />
          </button>
          {openFilter === "status" && (
            <div className="rw-chips" role="group" aria-label="Status pengiriman">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={status === s ? "on" : ""}
                  onClick={() => setStatusSafe(s)}
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



      {tampil.map((h) => (
        <DayGroup
          key={h.key}
          h={h}
          open={openDayKey === h.key}
          onToggleDay={toggleDay}
          onCopy={salin}
        />
      ))}

      {hari.length > limit && (
        <button type="button" className="rw-more" onClick={moreSafe}>
          Tampilkan tanggal berikutnya ({hari.length - limit} tersisa)
        </button>
      )}

      <div className="rw-spacer" />
      {toast && <div className="rw-toast">{toast}</div>}
    </div>
  );
}
