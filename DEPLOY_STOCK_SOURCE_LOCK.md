# Deploy V6.7.1 STOCK-SOURCE-LOCK

## Critical
GitHub Code.gs must be restored from local artifact:
`Code_GudangAI_V6.7.1_STOCK_SOURCE_LOCK.gs`

## Production today
Live Web App still reports `6.6.5+BULK-STABLE` until you deploy New version in Apps Script.

## Steps
1. Backup current Apps Script Code.gs
2. Paste full content of Code_GudangAI_V6.7.1_STOCK_SOURCE_LOCK.gs
3. Deploy → Manage deployments → Edit → New version → Deploy
4. Ping must return version `6.7.1+STOCK-SOURCE-LOCK`
5. Fix sheet formulas: `=I4-(J4+K4)` for Stock Akhir column

## Guards in V6.7.1
- resolveTransactionSheet_ rejects Stock CV/PT names
- HARD GUARD after sheet resolve
- enforceNonNegativeStock_ throws if called
- Writes only: Barang masuk/keluar/rusak + ledger + PO
