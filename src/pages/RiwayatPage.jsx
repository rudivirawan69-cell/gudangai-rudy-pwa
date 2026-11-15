import { useMemo, useState, useEffect, useCallback } from "react";
import "./riwayat.css";
import { getLocalHistory, getPendingQueue } from "../data/api";
import {
  gabung, filterTx, kelompokkan, hitungStatus, keCSV, jamWIB, ringkasanTeks,
} from "../data/riwayatAdapter.js";

/**
 * RiwayatPage — redesain UI + integrasi App
 * Props: onNavigate (goTab)
 * Data lokal dari getLocalHistory(); remote belum dihubungkan.
 */

const TIPE_LABEL = { masuk: "Masuk", keluar: "Keluar", rusak: "Rusak" };
const ARAH = { masuk: "↓", keluar: "↑", rusak: "!" };
const STATUS_LABEL = { terkirim: "Terkirim", antrian: "Antrian", gagal: "Gagal", lokal: "Lokal" };
const ENT = ["semua", "CV", "PT", "Bahan Baku"];
const DENSITY_KEY = "gudangai:riwayat:density:v1";
const BATCH = 40;

const fmt = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

function judul(t) {
  const a = t.items[0];
  const nama = a?.nama || a?.kode || "(tanpa nama)";
  return t.jumlahItem > 1 ? `${nama} +${t.jumlahItem - 1} lainnya` : nama;
}

function Baris({ t, buka, onToggle, onRetry, onCopy, ringkas }) {
  return (
    <article className={`rw-row rw-${t.tipe}${buka ? " is-open" : ""}${ringkas ? " is-compact" : ""}`}>
      <button type="button" className="rw-row-head" onClick={onToggle} aria-expanded={buka}>
        <span className="rw-ico" aria-hidden="true">{ARAH[t.tipe] || "·"}</span>
        <span className="rw-main">
          <b>{judul(t)}</b>
          <small>
            {TIPE_LABEL[t.tipe] || t.tipe || "?"} · {t.entitas ?? "?"} · {fmt(t.totalQty)} total · {jamWIB(t.ts)}
          </small>
        </span>
        <span className={`rw-pill rw-s-${t.status}`}>{STATUS_LABEL[t.status] || t.status}</span>
      </button>
      {buka && (
        <div className="rw-detail">
          <ul>
            {(t.items || []).map((i, n) => (
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
}

export default function RiwayatPage({ onNavigate }) {
  const [tick, setTick] = useState(0);
  const local = useMemo(() => {
    try {
      return getLocalHistory() || [];
    } catch {
      return [];
    }
  }, [tick]);

  const queueCount = useMemo(() => {
    try {
      return (getPendingQueue() || []).length;
    } catch {
      return 0;
    }
  }, [tick]);

  const remote = undefined;
  const loading = false;
  const error = null;
  const onRefresh = useCallback(() => {
    setTick((n) => n + 1);
  }, []);
  const onOpenQueue = useCallback(() => {
    onNavigate?.("sync");
  }, [onNavigate]);
  const onRetry = undefined;

  const [tipe, setTipe] = useState("semua");
  const [entitas, setEntitas] = useState("semua");
  const [status, setStatus] = useState("semua");
  const [q, setQ] = useState("");
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

  useEffect(() => {
    try {
      localStorage.setItem(DENSITY_KEY, ringkas ? "compact" : "comfortable");
    } catch {}
  }, [ringkas]);

  useEffect(() => {
    setLimit(BATCH);
  }, [tipe, entitas, status, q]);

  const semua = useMemo(() => gabung(local, remote || []), [local, remote]);
  const cntStatus = useMemo(() => hitungStatus(semua.filter((t) => !t.anomali)), [semua]);
  const cntTipe = useMemo(() => {
    const c = { semua: 0, masuk: 0, keluar: 0, rusak: 0 };
    semua.filter((t) => !t.anomali).forEach((t) => {
      c.semua += 1;
      if (c[t.tipe] != null) c[t.tipe] += 1;
    });
    return c;
  }, [semua]);

  const tersaring = useMemo(
    () => filterTx(semua, { tipe, entitas, status, q }),
    [semua, tipe, entitas, status, q]
  );
  const { hari, anomali: listAnomali } = useMemo(() => kelompokkan(tersaring), [tersaring]);
  const anomali = listAnomali?.length || 0;

  const tampil = useMemo(() => {
    let sisa = limit;
    const out = [];
    for (const h of hari) {
      if (sisa <= 0) break;
      const items = h.items.slice(0, sisa);
      out.push({ ...h, items });
      sisa -= items.length;
    }
    return out;
  }, [hari, limit]);

  const totalValid = hari.reduce((a, h) => a + h.items.length, 0);
  const nAntrian = queueCount || cntStatus.antrian || 0;
  const adaFilter = tipe !== "semua" || entitas !== "semua" || status !== "semua" || q.trim() !== "";

  const info = (t) => {
    setToast(t);
    setTimeout(() => setToast(""), 2000);
  };
  const salin = useCallback(async (t) => {
    try {
      await navigator.clipboard.writeText(ringkasanTeks(t));
      info("Disalin");
    } catch {
      info("Gagal menyalin");
    }
  }, []);

  const ekspor = () => {
    const csv = keCSV(tersaring.filter((t) => !t.anomali));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riwayat-gudangai-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    info("CSV diunduh");
  };

  const resetFilter = () => {
    setTipe("semua");
    setEntitas("semua");
    setStatus("semua");
    setQ("");
  };

  return (
    <div className="rw-page">
      <header className="rw-head">
        <div>
          <small>Log audit transaksi</small>
          <h1>Riwayat</h1>
          <p className="rw-sub">
            {totalValid} valid
            {anomali > 0 ? ` · ${anomali} tidak valid disembunyikan` : ""}
            {" · "}
            lokal perangkat
          </p>
        </div>
        <div className="rw-head-actions">
          {nAntrian > 0 && (
            <button type="button" className="rw-btn-queue" onClick={onOpenQueue}>
              Antrian {nAntrian}
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
            <small>Filter atau buka Antrian Sinkronisasi</small>
          </div>
          <div className="rw-banner-btns">
            {cntStatus.gagal > 0 && (
              <button type="button" onClick={() => setStatus("gagal")}>
                Lihat gagal
              </button>
            )}
            {nAntrian > 0 && (
              <button type="button" className="rw-primary" onClick={onOpenQueue}>
                Antrian
              </button>
            )}
          </div>
        </div>
      )}

      <div className="rw-filters">
        <div className="rw-chips" role="group" aria-label="Jenis transaksi">
          {[
            { id: "semua", label: "Semua" },
            { id: "masuk", label: "Masuk" },
            { id: "keluar", label: "Keluar" },
            { id: "rusak", label: "Rusak" },
          ].map((x) => (
            <button
              key={x.id}
              type="button"
              className={tipe === x.id ? "on" : ""}
              onClick={() => setTipe(x.id)}
            >
              {x.label}
              {x.id !== "semua" && cntTipe[x.id] != null ? <em>{cntTipe[x.id]}</em> : null}
            </button>
          ))}
        </div>
        <div className="rw-chips" role="group" aria-label="Entitas">
          {ENT.map((e) => (
            <button
              key={e}
              type="button"
              className={entitas === e ? "on" : ""}
              onClick={() => setEntitas(e)}
            >
              {e === "semua" ? "Semua entitas" : e}
            </button>
          ))}
        </div>
        <div className="rw-chips" role="group" aria-label="Status kirim">
          {["semua", "terkirim", "antrian", "gagal", "lokal"].map((s) => (
            <button
              key={s}
              type="button"
              className={status === s ? "on" : ""}
              onClick={() => setStatus(s)}
            >
              {s === "semua" ? "Semua status" : STATUS_LABEL[s] || s}
            </button>
          ))}
        </div>
      </div>

      <div className="rw-search">
        <input
          type="search"
          placeholder="Cari kode / nama / keterangan…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Hapus">
            ✕
          </button>
        )}
        <button type="button" className="rw-btn-export" onClick={ekspor} title="Ekspor CSV">
          CSV
        </button>
      </div>

      {error && (
        <div className="rw-alert">
          {error}{" "}
          <button type="button" onClick={onRefresh}>
            Coba lagi
          </button>
        </div>
      )}

      {anomali > 0 && (
        <div className="rw-alert rw-soft">
          {anomali} entri tidak valid disembunyikan (qty 0 / tanpa item). Tidak dihapus dari perangkat.
        </div>
      )}

      {loading && totalValid === 0 && <div className="rw-skel">{[0, 1, 2].map((i) => <div key={i} />)}</div>}

      {!loading && totalValid === 0 && (
        <div className="rw-empty">
          <b>{adaFilter ? "Tidak ada hasil" : "Belum ada riwayat"}</b>
          <p>
            {adaFilter
              ? "Ubah filter atau reset."
              : "Transaksi berhasil akan muncul di sini."}
          </p>
          {adaFilter && (
            <button type="button" className="rw-primary" onClick={resetFilter}>
              Reset filter
            </button>
          )}
        </div>
      )}

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
              onToggle={() => setOpenId(openId === t.id ? null : t.id)}
              onRetry={onRetry}
              onCopy={salin}
              ringkas={ringkas}
            />
          ))}
        </section>
      ))}

      {totalValid > limit && (
        <button type="button" className="rw-more" onClick={() => setLimit((n) => n + BATCH)}>
          Tampilkan lebih banyak ({totalValid - limit} tersisa)
        </button>
      )}

      <div className="rw-spacer" />
      {toast && <div className="rw-toast">{toast}</div>}
    </div>
  );
}
