import { memo, useMemo, useState, useEffect, useCallback, useDeferredValue } from "react";
import "./stok.css";
import { useStock } from "../hooks/useStock";
import { ENTITAS, TIDAK_TERKLASIFIKASI, normalizeAll } from "../data/stokAdapter.js";

/**
 * StokPage — redesain v2.1 + optimasi render
 * - memo ItemRow / Divisi
 * - useDeferredValue untuk pencarian
 * - Paginasi 60 item
 * - Callback stabil
 */

const RANK = { kritis: 0, waspada: 1, aman: 2 };
const LABEL = { kritis: "Kritis", waspada: "Waspada", aman: "Aman" };
const CACHE_KEY = "gudangai:stok:snapshot:v1";
const STALE_MENIT = 10;
const BATCH = 60;

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
  for (let i = 0; i < list.length; i++) c[list[i].status] += 1;
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
});

const Divisi = memo(function Divisi({ nama, items, open, onToggle, onOpen }) {
  const c = ringkas(items);
  return (
    <section className={`sk-div${open ? " is-open" : ""}`}>
      <button type="button" className="sk-div-head" onClick={() => onToggle(nama)} aria-expanded={open}>
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
            <ItemRow key={`${it.entitas}-${it.kode}`} it={it} onOpen={onOpen} />
          ))}
        </div>
      )}
    </section>
  );
});
