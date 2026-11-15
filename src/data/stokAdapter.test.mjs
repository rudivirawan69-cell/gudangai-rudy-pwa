import test from "node:test";
import assert from "node:assert/strict";
import { toNumber, hitungStatus, norm, normalizeAll, normalizeEntitas, tentukanEntitas } from "./stokAdapter.js";

test("toNumber format id-ID dan en", () => {
  assert.equal(toNumber("1.234,5"), 1234.5);
  assert.equal(toNumber("1,234.5"), 1234.5);
  assert.equal(toNumber("12,5"), 12.5);
  assert.equal(toNumber(""), 0);
  assert.equal(toNumber(null), 0);
  assert.equal(toNumber(7), 7);
});
test("status identik Dashboard: <10 kritis, <20 waspada, selain itu aman", () => {
  assert.equal(hitungStatus(0), "kritis");
  assert.equal(hitungStatus(9.99), "kritis");
  assert.equal(hitungStatus(10), "waspada");
  assert.equal(hitungStatus(19.99), "waspada");
  assert.equal(hitungStatus(20), "aman");
});
test("minimum (stockAman) tidak memengaruhi status", () => {
  assert.equal(norm({ nama: "A", stockAkhir: 15, stockAman: 100 }).status, "waspada");
  assert.equal(norm({ nama: "A", stockAkhir: 50, stockAman: 100 }).status, "aman");
  assert.equal(norm({ nama: "A", stockAkhir: 50, stockAman: 100 }).min, 100);
  assert.equal(norm({ nama: "A", stockAkhir: 50 }).min, 0);
});
test("status API yang berbeda hanya ditandai, tidak dipakai", () => {
  const r = norm({ nama: "A", stockAkhir: 5, status: "aman" });
  assert.equal(r.status, "kritis");
  assert.equal(r._statusBeda, true);
});
test("Bahan Baku dikenali dari divisi/sumber walau entitas CV", () => {
  assert.equal(tentukanEntitas({ entitas: "CV", divisi: "Bahan Baku" }), "Bahan Baku");
  assert.equal(tentukanEntitas({ entitas: "PT", sheet: "Stock Bahan Baku" }), "Bahan Baku");
  assert.equal(tentukanEntitas({ entitas: "PT", divisi: "Dapur 1" }), "PT");
});
test("sisa dari Stock Akhir, bukan Stock Awal", () => {
  const r = norm({ nama: "A", stockAwal: 100, stockAkhir: 3, entitas: "CV" });
  assert.equal(r.stok, 3);
  assert.equal(r.status, "kritis");
});
test("hanya ada Stock Awal -> ditandai, stok 0", () => {
  const r = norm({ nama: "B", stockAwal: 100, entitas: "PT" });
  assert.equal(r.stok, 0);
  assert.equal(r._hanyaAwal, true);
});
test("entitas", () => {
  assert.equal(normalizeEntitas("Bahan Baku"), "Bahan Baku");
  assert.equal(normalizeEntitas("cv"), "CV");
  assert.equal(normalizeEntitas("xx"), null);
});
test("duplikat hanya dihitung sekali; tanpa entitas tidak hilang", () => {
  const { items, laporan } = normalizeAll(
    [
      { kode: "1", nama: "A", entitas: "CV", stockAkhir: 1 },
      { kode: "1", nama: "A", entitas: "CV", stockAkhir: 2 },
      { kode: "2", nama: "B", entitas: "PT", stockAkhir: 1 },
      { kode: "3", nama: "C", entitas: "??", stockAkhir: 1 },
    ],
    { targetTotal: 193 }
  );
  assert.equal(laporan.baris, 4);
  assert.equal(items.length, 3);
  assert.equal(items.find((i) => i.kode === "1").stok, 1);
  assert.equal(laporan.duplikat.length, 1);
  assert.equal(laporan.tanpaEntitas, 1);
  assert.equal(laporan.perEntitas["Tidak terklasifikasi"], 1);
  assert.equal(laporan.selisihTarget, 3 - 193);
});
test("tanpa kode: kunci duplikat memakai nama + divisi", () => {
  const { items } = normalizeAll([
    { nama: "Saos", divisi: "CS", entitas: "CV", stockAkhir: 1 },
    { nama: "Saos", divisi: "Dapur 1", entitas: "CV", stockAkhir: 1 },
    { nama: "Saos", divisi: "CS", entitas: "CV", stockAkhir: 9 },
  ]);
  assert.equal(items.length, 2);
});
