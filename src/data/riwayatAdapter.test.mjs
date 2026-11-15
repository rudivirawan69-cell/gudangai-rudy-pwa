import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWaktu, normTx, gabung, kelompokkan, filterTx, keCSV, kunciHari, labelHari, jamWIB, hitungStatus, normStatus,
} from "./riwayatAdapter.js";

test("parseWaktu ISO dan epoch", () => {
  assert.ok(parseWaktu("2026-11-13T12:30:00+07:00") > 0);
  assert.ok(parseWaktu(Date.now()) > 0);
  assert.equal(parseWaktu(""), null);
  assert.equal(parseWaktu(null), null);
});

test("normTx menandai anomali qty 0 / tanpa item", () => {
  const a = normTx({ type: "masuk", entity: "CV", items: [], savedAt: Date.now() });
  assert.equal(a.anomali, true);
  const b = normTx({ type: "masuk", entity: "CV", items: [{ kode: "X", qty: 0 }], savedAt: Date.now() });
  assert.equal(b.anomali, true);
  const c = normTx({ type: "keluar", entity: "PT", items: [{ kode: "Y", nama: "Y", qty: 2, satuan: "Pack" }], savedAt: Date.now() });
  assert.equal(c.anomali, false);
  assert.equal(c.totalQty, 2);
  assert.equal(c.tipe, "keluar");
  assert.equal(c.entitas, "PT");
});

test("gabung dedup by kunci", () => {
  const list = gabung(
    [{ id: "1", type: "masuk", entity: "CV", items: [{ kode: "A", qty: 1 }], savedAt: 1000 }],
    [{ id: "1", type: "masuk", entity: "CV", items: [{ kode: "A", qty: 1 }], savedAt: 1000 }]
  );
  assert.equal(list.length, 1);
});

test("kelompokkan memisah anomali", () => {
  const list = gabung([
    { type: "masuk", entity: "CV", items: [{ kode: "A", qty: 1 }], savedAt: Date.now() },
    { type: "masuk", entity: "CV", items: [], savedAt: Date.now() },
  ]);
  const { hari, anomali } = kelompokkan(list);
  assert.equal(anomali.length, 1);
  assert.ok(hari.length >= 1);
});

test("filterTx tipe/entitas/q", () => {
  const list = gabung([
    { type: "masuk", entity: "CV", items: [{ kode: "BB-1", nama: "Bahan X", qty: 1 }], savedAt: Date.now() },
    { type: "keluar", entity: "PT", items: [{ kode: "P1", nama: "Produk", qty: 2 }], savedAt: Date.now() },
  ]);
  assert.equal(filterTx(list, { tipe: "masuk" }).length, 1);
  assert.equal(filterTx(list, { entitas: "PT" }).length, 1);
  assert.equal(filterTx(list, { q: "bahan" }).length, 1);
});

test("jamWIB dan kunciHari konsisten Asia/Jakarta", () => {
  const ts = Date.parse("2026-11-13T23:30:00+07:00");
  assert.equal(kunciHari(ts), "2026-11-13");
  assert.ok(jamWIB(ts).includes("23"));
});

test("labelHari Hari ini / Kemarin", () => {
  const now = Date.now();
  assert.equal(labelHari(kunciHari(now), now), "Hari ini");
});

test("hitungStatus", () => {
  const list = [
    { status: "terkirim", anomali: false },
    { status: "gagal", anomali: false },
    { status: "antrian", anomali: false },
  ];
  const c = hitungStatus(list);
  assert.equal(c.terkirim, 1);
  assert.equal(c.gagal, 1);
  assert.equal(c.antrian, 1);
});

test("keCSV header dan pemisah titik koma", () => {
  const list = gabung([
    { type: "masuk", entity: "CV", items: [{ kode: "A", nama: "Item A", qty: 3, satuan: "Pack" }], savedAt: Date.now(), keterangan: "uji" },
  ]);
  const csv = keCSV(list);
  assert.ok(csv.includes("Tanggal"));
  assert.ok(csv.includes(";"));
  assert.ok(csv.includes("Item A"));
});

test("normStatus dari sumber spreadsheet default terkirim", () => {
  assert.equal(normStatus("", "spreadsheet"), "terkirim");
  assert.equal(normStatus("pending", "lokal"), "antrian");
});
