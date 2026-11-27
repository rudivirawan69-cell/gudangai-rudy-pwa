import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRemoteTransactionHistory, claimPendingAutoSend, getPendingHomeSuccessReceipt, acknowledgeHomeSuccessReceipt } from "./api.js";

vi.mock("./offlineStore", () => ({ persistQueueBackup: vi.fn(async () => {}), hydrateQueueBackup: vi.fn(async () => ({ queue: [], revision: 0 })) }));

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
describe("sync handoff and home success receipt", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("claims an auto-send request once and leaves item data in the pending queue", async () => {
    const queued = [{
      id: "Q-1", type: "barangKeluar", entity: "CV", tanggal: "2026-11-27",
      status: "PENDING_REVIEW", autoSendRequested: true,
      items: [{ clientItemId: "CI-1", kode: "CV-0001", nama: "Barang", qty: 2 }],
    }];
    localStorage.setItem("gudangai_queue", JSON.stringify(queued));
    const claimed = await claimPendingAutoSend(["CI-1"]);
    expect(claimed).toEqual(["CI-1"]);
    const stored = JSON.parse(localStorage.getItem("gudangai_queue"));
    expect(stored[0]).toMatchObject({ autoSendRequested: false, status: "PENDING_REVIEW" });
    expect(stored[0].items[0]).toMatchObject({ clientItemId: "CI-1", kode: "CV-0001", qty: 2 });
    expect(await claimPendingAutoSend(["CI-1"])).toEqual([]);
  });

  it("exposes a durable home success receipt until acknowledged", () => {
    const receipt = { id: "HOME-SUCCESS-1", count: 2, expiresAt: Date.now() + 60000 };
    localStorage.setItem("gudangai_home_success_receipt_v1", JSON.stringify(receipt));
    expect(getPendingHomeSuccessReceipt()).toEqual(receipt);
    expect(acknowledgeHomeSuccessReceipt(receipt.id)).toBe(true);
    expect(getPendingHomeSuccessReceipt()).toBeNull();
  });
});

