import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRemoteTransactionHistory } from "./api.js";

describe("fetchRemoteTransactionHistory", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("reads all three transaction sheets and maps flat rows into renderable transactions", async () => {
    const rowsBySheet = {
      "Barang masuk": [{
        row: 14, tanggal: "2026-11-26T01:00:00.000Z", kode: "BBCV-0001",
        nama: "Bonelles Dada", satuan: "Kg", qty: 4, transactionId: "TX-IN-1", entitas: "CV",
      }],
      "Barang keluar": [{
        row: 25, tanggal: "2026-11-26T02:00:00.000Z", kode: "WK-0004",
        nama: "Iga Sapi", satuan: "Kg", qty: 2, transactionId: "TX-OUT-1", entitas: "PT",
      }],
      "Barang Rusak": [{
        row: 31, tanggal: "2026-11-26T03:00:00.000Z", kode: "BBPT-0012",
        nama: "Bebek", satuan: "Pack", qty: 1, transactionId: "TX-DMG-1", entitas: "PT",
      }],
    };
    const fetchMock = vi.fn(async (input) => {
      const url = new URL(String(input));
      const sheet = url.searchParams.get("sheet");
      return new Response(JSON.stringify({
        success: true,
        sheet,
        count: rowsBySheet[sheet].length,
        data: rowsBySheet[sheet],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchRemoteTransactionHistory(31);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const requestedSheets = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)).searchParams.get("sheet"))
      .sort();
    expect(requestedSheets).toEqual(["Barang Rusak", "Barang keluar", "Barang masuk"]);
    expect(result).toHaveLength(3);
    expect(result.map((row) => row.type).sort()).toEqual(["Barang Rusak", "Barang keluar", "Barang masuk"].map((sheet) => ({
      "Barang masuk": "masuk", "Barang keluar": "keluar", "Barang Rusak": "rusak",
    })[sheet]).sort());
    expect(result.find((row) => row.transactionId === "TX-OUT-1")).toMatchObject({
      entity: "PT",
      items: [{ kode: "WK-0004", nama: "Iga Sapi", qty: 2, satuan: "Kg" }],
    });
  });
});
