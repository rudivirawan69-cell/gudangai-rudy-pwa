import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWaktu, normTx, gabung, kelompokkan, filterTx, keCSV, kunciHari, labelHari, jamWIB, hitungStatus, normStatus, ringkasKatalog, normalisasiRiwayatServer,
} from "./riwayatAdapter.js";

test("parseWaktu ISO dan epoch", () => {
  assert.ok(parseWaktu("2026-11-13T12:30:00+07:00") > 0);
  assert.ok(parseWaktu(Date.now()) > 0);
  assert.equal(parseWaktu(""), null);
  assert.equal(parseWaktu(null), null);
});

test("normTx menandai anomali qty 0 / tanpa item + cache", () => {
  const a = normTx({ type: "masuk", entity: "CV", items: [], savedAt: Date.now() });
  assert.equal(a.anomali, true);
  const b = normTx({ type: "masuk", entity: "CV", items: [{ kode: "X", qty: 0 }], savedAt: Date.now() });
  assert.equal(b.anomali, true);
  const c = normTx({ type: "keluar", entity: "PT", items: [{ kode: "Y", nama: "Y", qty: 2, satuan: "Pack" }], savedAt: Date.now() });
  assert.equal(c.anomali, false);
  assert.equal(c.totalQty, 2);
  assert.equal(c.tipe, "keluar");
  assert.equal(c.entitas, "PT");
  assert.ok(c.hariKey);
  assert.ok(c.jamLabel);
  assert.ok(c._hay.includes("y"));
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

test("filterTx tipe/entitas/q memakai haystack", () => {
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

test("labelHari Hari ini", () => {
  const now = Date.now();
  assert.equal(labelHari(kunciHari(now), now), "Hari ini");
});

test("hitungStatus & ringkasKatalog", () => {
  const list = [
    { status: "terkirim", tipe: "masuk", anomali: false },
    { status: "gagal", tipe: "keluar", anomali: false },
    { status: "antrian", tipe: "masuk", anomali: false },
    { status: "lokal", tipe: "rusak", anomali: true },
  ];
  const c = hitungStatus(list);
  assert.equal(c.terkirim, 1);
  assert.equal(c.gagal, 1);
  const k = ringkasKatalog(list);
  assert.equal(k.anomali, 1);
  assert.equal(k.tipe.masuk, 2);
  assert.equal(k.status.gagal, 1);
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

test("normalisasiRiwayatServer converts flat Apps Script rows into valid typed transactions", () => {
  const incoming = normalisasiRiwayatServer([
    { row: 18, tanggal: "2026-11-26T01:00:00.000Z", kode: "BBCV-0001", nama: "Bonelles Dada", satuan: "Kg", qty: 4, keterangan: "inbound note", transactionId: "TX-CI-IN", requestId: "CI-IN", entitas: "CV" },
  ], "Barang masuk");
  const outgoing = normalisasiRiwayatServer([
    { row: 29, tanggal: "2026-11-26T02:00:00.000Z", kode: "WK-0004", nama: "Iga Sapi", satuan: "Kg", qty: 2, keterangan: "outbound note", transactionId: "TX-CI-OUT", requestId: "CI-OUT", entitas: "PT" },
  ], "Barang keluar");
  const damaged = normalisasiRiwayatServer([
    { row: 31, tanggal: "2026-11-26T03:00:00.000Z", kode: "BBPT-0012", nama: "Bebek", satuan: "Pack", qty: 1, keterangan: "damage note", transactionId: "TX-CI-DMG", requestId: "CI-DMG", entitas: "PT" },
  ], "Barang Rusak");

  const incomingTx = normTx(incoming[0], "spreadsheet");
  const outgoingTx = normTx(outgoing[0], "spreadsheet");
  const damagedTx = normTx(damaged[0], "spreadsheet");
  assert.equal(incomingTx.tipe, "masuk");
  assert.equal(incomingTx.entitas, "CV");
  assert.equal(incomingTx.items[0].kode, "BBCV-0001");
  assert.equal(incomingTx.items[0].qty, 4);
  assert.equal(incomingTx.kunci, "TX-CI-IN");
  assert.equal(outgoingTx.tipe, "keluar");
  assert.equal(outgoingTx.entitas, "PT");
  assert.equal(outgoingTx.items[0].nama, "Iga Sapi");
  assert.equal(damagedTx.tipe, "rusak");
  assert.equal(damagedTx.entitas, "PT");
  assert.equal(damagedTx.anomali, false);
});

test("normalisasiRiwayatServer does not invent an entity or transaction identity when server data lacks them", () => {
  const [row] = normalisasiRiwayatServer([
    { row: 44, tanggal: "2026-11-26T04:00:00.000Z", kode: "UNKNOWN-01", nama: "Unknown", satuan: "Pack", qty: 1 },
  ], "Barang keluar");
  const tx = normTx(row, "spreadsheet");
  assert.equal(row.entitas, null);
  assert.equal(row.transactionId, "");
  assert.equal(row.id, "Barang keluar:44");
  assert.equal(tx.entitas, null);
  assert.equal(tx.anomali, false);
});
