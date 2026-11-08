# V6.6.6+CONFIRM-PO backend takeover patch

Target source: `Code_GudangAI_V6.6.4_STOCK_SOURCE_LOCK_PATCH.gs`.

## Required doPost route

Add inside the existing `switch (action)`:

```javascript
case "confirmPOStatus": return jsonResponse(confirmPOStatus(body));
```

## Function to append after the existing PO helpers

```javascript
function confirmPOStatus(body) {
  body = body || {};
  const requestId = String(body.requestId || '').trim();
  const itemNo = String(body.itemNo == null ? '' : body.itemNo).trim();
  const nama = String(body.nama || '').trim();
  const status = String(body.status || 'Selesai').trim();
  const qtyDatang = Number(body.qtyDatang);

  if (!requestId) return {success:false,status:'REJECTED',code:'REQUEST_ID_REQUIRED',error:'requestId wajib diisi.'};
  if (!itemNo && !nama) return {success:false,status:'REJECTED',code:'PO_ITEM_REQUIRED',error:'itemNo atau nama wajib diisi.'};
  if (!['Selesai','Sebagian','Menunggu'].includes(status)) return {success:false,status:'REJECTED',code:'INVALID_PO_STATUS',error:'Status PO tidak valid.'};
  if (!Number.isFinite(qtyDatang) || qtyDatang < 0) return {success:false,status:'REJECTED',code:'INVALID_QTY',error:'qtyDatang tidak valid.'};

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return {success:false,status:'REJECTED',code:'LOCK_TIMEOUT',error:'Backend sedang sibuk. Coba lagi.'};

  try {
    const props = PropertiesService.getScriptProperties();
    const idemKey = 'PO_CONFIRM_' + requestId;
    const prior = props.getProperty(idemKey);
    if (prior) {
      try { return JSON.parse(prior); } catch (_) {}
    }

    const ss = getSS();
    const po = ss.getSheetByName('purchase order');
    if (!po) return {success:false,status:'ERROR',code:'PO_SHEET_NOT_FOUND',error:"Sheet 'purchase order' tidak ditemukan."};

    const lastRow = Math.max(po.getLastRow(), 6);
    if (lastRow < 6) return {success:false,status:'ERROR',code:'PO_EMPTY',error:'Data purchase order kosong.'};

    const rows = po.getRange(6, 2, lastRow - 5, 7).getValues(); // B:H
    let found = -1, foundNo = '', foundName = '', totalQty = 0;

    for (let i = 0; i < rows.length; i++) {
      const no = String(rows[i][0] == null ? '' : rows[i][0]).trim();
      const nm = String(rows[i][1] == null ? '' : rows[i][1]).trim();
      if ((itemNo && no === itemNo) || (!itemNo && nama && nm.toLowerCase() === nama.toLowerCase())) {
        found = i + 6;
        foundNo = no;
        foundName = nm;
        totalQty = Number(rows[i][6]) || 0;
        break;
      }
    }

    if (found < 0) return {success:false,status:'ERROR',code:'PO_ITEM_NOT_FOUND',error:'Item PO tidak ditemukan.'};
    if (status === 'Selesai' && totalQty > 0 && qtyDatang < totalQty)
      return {success:false,status:'REJECTED',code:'QTY_BELOW_PO',error:'Status Selesai membutuhkan qtyDatang minimal sama dengan qty PO.'};
    if (totalQty > 0 && qtyDatang > totalQty)
      return {success:false,status:'REJECTED',code:'QTY_EXCEEDS_PO',error:'qtyDatang melebihi qty PO.'};

    // ONLY purchase-order J:K. Stock CV/PT and transaction sheets are untouched.
    po.getRange(found, 10, 1, 2).setValues([[status.toUpperCase(), qtyDatang]]);
    SpreadsheetApp.flush();

    const result = {
      success:true,status:'APPLIED',code:'PO_STATUS_UPDATED',requestId,
      itemNo:foundNo || itemNo,nama:foundName || nama,
      qtyPO:totalQty,qtyDatang,poStatus:status
    };
    props.setProperty(idemKey, JSON.stringify(result));
    return result;
  } catch (err) {
    return {success:false,status:'ERROR',code:'PO_CONFIRM_FAILED',requestId,error:String(err && err.message || err)};
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}
```

## Safety contract

- Does not call `addTransaction`, `bulkTransaction`, or stock writers.
- Does not write Stock CV/PT.
- Writes only `purchase order!J:K`.
- Uses ScriptLock.
- Uses requestId idempotency.
- Existing PWA `confirmPOStatus()` already sends the required action and requestId.
