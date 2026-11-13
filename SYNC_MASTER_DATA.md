# GudangAI Master Data Synchronization Guide

## 📋 Status Saat Ini

### Masalah yang Terdeteksi

#### 1. **Duplikasi & Inkonsistensi Master Data**
- `master.js` (root) - **LENGKAP**: 189 items (CV + PT + WK)
- `src/data/master.js` - **TERPOTONG**: Hanya 49 items (MASTER_PT tidak lengkap)

#### 2. **Perbedaan Kritis**

| File | MASTER_CV | MASTER_PT | Total | Status |
|------|-----------|-----------|-------|--------|
| `/master.js` | 47 items | 59 items | 106 + WK | ✅ LENGKAP |
| `/src/data/master.js` | 40 items | 9 items | 49 | ❌ TERPOTONG |
| BACKEND (Code.gs aktif) | CV/PT + Bahan Baku | Dinamis dari Dashboard Live | 193 baseline Nov 2026 | ✅ SUMBER TRUTH DINAMIS |

#### 3. **Perbedaan Item Spesifik**

**Contoh yang Hilang di `src/data/master.js`:**
- CV-0088: "Chicken Shrimp Roll"
- CV-0089: "Chicken Ball"
- PT-0001 s/d PT-0055: Hampir semua (hanya 9 yang ada!)
- Semua WK-*, MM-*, BB* (BAHAN BAKU)

#### 4. **Masalah Import Path Inconsistency**
```javascript
// Root master.js
import aliasConfig from './alias-config.json';  // ❌ Relative path issue

// src/data/master.js
import aliasConfig from './alias-config.json';  // ✅ Correct for src/data
```

---

## ✅ Solusi Sinkronisasi

### Fase 1: **Restore Lengkap** (Immediate)

#### Step 1: Update `/src/data/master.js` dengan data lengkap dari `/master.js`

```javascript
// src/data/master.js - SYNC dari root/master.js
// Ensure MASTER_PT COMPLETE + semua kode variant

const MASTER_CV = [
  // ... 47 items (copy exactly dari root/master.js baris 4-46)
];

const MASTER_PT = [
  // ... 59 items LENGKAP (copy dari root/master.js baris 49-75)
  // PENTING: Include PT-0001 s/d PT-0059 SEMUA
];

// WK-* dan MM-* untuk PT (optional, tapi recommended untuk completeness)
// Jika tidak dipakai PWA, track dalam BACKEND saja
```

#### Step 2: Fix Import Path di `/src/data/master.js`

```javascript
// ❌ OLD
import aliasConfig from './alias-config.json';

// ✅ NEW - explicitly resolve from src/data
import aliasConfig from '../assets/alias-config.json';
// atau copy alias-config.json ke src/data/
```

#### Step 3: Update `/master.js` (Root) untuk Clarity

Rename atau dokumentasi bahwa ini adalah **LEGACY** file.

```javascript
/**
 * LEGACY REFERENCE FILE
 * 
 * For PWA builds, use: /src/data/master.js
 * This file exists for backward compat & reference only.
 * 
 * ⚠️ Source of truth untuk BACKEND: Code.gs V6.6.5
 * ⚠️ Source of truth untuk PWA: /src/data/master.js
 */
```

---

### Fase 2: **Establish Backend as Source of Truth**

#### Data Flow Architecture

```
BACKEND (Code.gs V6.6.5)
└─ Stock CV + Stock PT sheets (COLD STORAGE spreadsheet)
   └─ 193 item pada baseline November 2026 (dinamis; tidak di-hardcode)
      └─ API: doPost(action: "bootstrap")
         └─ PWA /bootstrap endpoint
            └─ getAllStock() API call
               └─ Update /src/data/master.js dynamically
                  └─ Sync cache on app startup
```

#### PWA Bootstrap Sync Implementation

**File: `src/hooks/useBootstrap.js` (NEW)**

```javascript
import { useEffect, useState } from 'react';
import { BACKEND_URL, API_SECRET } from '../config/api';

export function useBootstrap() {
  const [masterData, setMasterData] = useState(null);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const response = await fetch(`${BACKEND_URL}?action=bootstrap&secret=${API_SECRET}`);
        const data = await response.json();
        
        if (data.success && data.items) {
          // Store in localStorage
          localStorage.setItem('gudangai_master_version', data.masterVersion);
          localStorage.setItem('gudangai_stock_version', data.stockVersion);
          localStorage.setItem('gudangai_items', JSON.stringify(data.items));
          
          setMasterData(data.items);
          setSynced(true);
        }
      } catch (error) {
        console.warn('Bootstrap sync failed, using cached master:', error);
        const cached = localStorage.getItem('gudangai_items');
        if (cached) setMasterData(JSON.parse(cached));
      }
    }

    bootstrap();
  }, []);

  return { masterData, synced };
}
```

---

### Fase 3: **Verification & Testing**

#### Checklist Sinkronisasi

- [ ] `/src/data/master.js` memiliki 47 CV + 59 PT = 106 items (minimum)
- [ ] BACKEND returns all current CV + PT + Bahan Baku items via `bootstrap`; baseline November 2026 = 193, count follows additions automatically
- [ ] `alias-config.json` dapat diakses dari PWA build
- [ ] API endpoint `?action=bootstrap` returns `masterVersion` + `stockVersion`
- [ ] PWA localStorage caching works correctly
- [ ] DEV build: `npm run dev` loads master successfully
- [ ] PROD build: `npm run build` includes master data

#### Test Commands

```bash
# 1. Check master data completeness
node -e "
const master = require('./src/data/master.js');
console.log('CV items:', master.MASTER_CV.length);
console.log('PT items:', master.MASTER_PT.length);
console.log('Total:', master.MASTER_CV.length + master.MASTER_PT.length);
"

# 2. Verify PWA bundle includes master
npm run build
grep -r "CV-0001" dist/

# 3. Test backend bootstrap
curl "https://<YOUR_BACKEND_URL>?action=bootstrap&secret=<API_SECRET>"
```

---

## 📊 Data Inventory

### BACKEND Master Data (Code.gs V6.6.5 - AUTHORITATIVE)

```
Dashboard Live baseline November 2026: 193 item (dinamis, bukan konstanta).

Sumber:
- Stock CV + Stock PT: 165 SKU dihitung terpisah menurut entitas/kode.
- Stock Bahan Baku: 28 SKU dari sheet khusus.
- Total utama: 165 + 28 = 193 SKU.
- Status utama: Aman 100, Waspada 17, Kritis 76.
- Divisi: DAPUR 1 28, DAPUR 2 17, MIE 10, PACKING 57, CS 45, BAHAN BAKU 28, REKANAN 8.

Tampilan alternatif:
- Stok Gabungan Per Divisi: 113 produk setelah nama CV+PT yang sama digabung.
- Label tampilan: Gabungan CV+PT (113 produk).
- Angka 113 adalah hitungan alternatif; jangan ditambahkan ke 193 dan jangan dipakai sebagai total master.

Aturan:
- readDashboardLiveSummary_ membaca total/status/divisi berdasarkan label pada Dashboard Live.
- getAllStock(ALL) mengembalikan kode CV + PT + Bahan Baku.
- Jumlah 193 hanya baseline saat ini. Penambahan/penghapusan item mengikuti sumber dan Dashboard Live secara otomatis.
- Jika total sumber stok tidak sama dengan Dashboard Live, endpoint dashboard harus fail-closed, bukan menghitung ulang atau menampilkan angka perkiraan.
```

### Sync Mapping

```
BACKEND Sheet "Stock CV" 
└─ getAllStock("CV") 
   └─ Returns all CV items with:
      ├── kode
      ├── nama
      ├── satuan
      ├── stockAkhir (real-time)
      ├── stockAman
      ├── divisi
      └── stockValue

BACKEND Sheet "Stock PT"
└─ getAllStock("PT")
   └─ Same structure as CV
```

---

## 🔧 Implementation Steps

### 1. **Immediate Fix** (This Week)

```bash
# Replace src/data/master.js with complete data
# Copy PT-0001 through PT-0059 from root/master.js
git checkout master.js
# Extract MASTER_PT array
# Paste into src/data/master.js
# Commit: "fix: sync complete master data to PWA build"
```

### 2. **Mid-term** (Next Sprint)

- [ ] Implement `useBootstrap()` hook
- [ ] Add localStorage caching strategy
- [ ] Implement version checking (masterVersion vs stockVersion)
- [ ] Add offline fallback

### 3. **Long-term** (Architecture)

- [ ] Remove root `/master.js` entirely
- [ ] Single source: BACKEND Code.gs (authoritative)
- [ ] PWA pulls on startup via `bootstrap` action
- [ ] Version versioning with delta sync for performance

---

## ⚠️ Critical Notes

### Import Path Issue
The `alias-config.json` import in both files may fail if:
- Path resolution is relative vs absolute
- Build tool doesn't handle JSON imports
- PWA bundle strips out `/public` assets

**Solution:**
```javascript
// Ensure alias-config.json is in same directory
/src/data/
├── master.js
├── alias-config.json  ← Move here
└── ...

// Or import from public
import aliasConfig from '/alias-config.json';
```

### Version Control
```
BACKEND (Source) → Bootstrap API → PWA (Replica)
                  └─ masterVersion: sha256(master metadata)
                  └─ stockVersion: sha256(stock values)
```

When stock changes → `stockVersion` changes → PWA refetches

---

## 📚 References

- **BACKEND Master Data**: Code.gs lines 4-212 (getAllStock, getStockByCode)
- **PWA Config**: src/App.jsx (useConnection hook, useAuth)
- **Master Alias**: master.js lines 1-166 (searchMaster, matchByAlias)

---

## Questions & Debugging

### Q: Kenapa ada dua master.js?
**A:** Legacy artifact. Root version adalah reference; PWA gunakan `/src/data/master.js`. BACKEND adalah authoritative source via API.

### Q: Bagaimana update master?
**A:** 
1. Edit BACKEND spreadsheet (Stock CV / Stock PT sheets)
2. Backend returns new `masterVersion` via bootstrap
3. PWA detects version change
4. PWA re-caches dari API

### Q: Offline master data gimana?
**A:** 
1. First sync stores everything di localStorage
2. Offline mode uses cached version
3. Next online sync fetches latest + merges changes

---

**Last Updated:** 2026-10-02
**Status:** SYNC GUIDE v1.0
**Action Required:** Phase 1 (Restore Complete Data)
