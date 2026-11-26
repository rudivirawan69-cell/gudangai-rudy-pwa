import { describe, expect, it } from "vitest";
import { kelompokkan, normTx } from "./riwayatAdapter.js";

const transaksi = (at, id = "tx-1") => normTx({
  id,
  type: "masuk",
  entity: "CV",
  at,
  items: [{ kode: "CV-0001", nama: "Ayam Fillet", qty: 5, satuan: "kg" }],
}, "spreadsheet");

describe("Riwayat transaction time and date grouping", () => {
  it("shows the real WIB time, including an exact midnight timestamp", () => {
    expect(transaksi("2026-11-26T00:00:00+07:00").jamLabel).toBe("00:00 WIB");
    expect(transaksi("2026-11-25T17:30:00.000Z").jamLabel).toBe("00:30 WIB");
  });

  it("does not invent a time when the source contains only a date", () => {
    const tx = transaksi("2026-11-26");
    expect(tx.adaWaktu).toBe(false);
    expect(tx.jamLabel).toBe("Waktu tidak tercatat");
  });

  it("groups every transaction on the same Jakarta calendar date", () => {
    const a = transaksi("2026-11-25T17:30:00.000Z", "a");
    const b = transaksi("2026-11-26T08:15:00+07:00", "b");
    const grouped = kelompokkan([b, a]);
    expect(grouped.hari).toHaveLength(1);
    expect(grouped.hari[0].items.map((tx) => tx.id)).toEqual(["b", "a"]);
    expect(grouped.totalValid).toBe(2);
  });
});
