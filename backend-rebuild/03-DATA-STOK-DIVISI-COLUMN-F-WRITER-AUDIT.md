# 03 — Audit Penulis Data Stok Per Divisi (Kolom F)

Tanggal: 2026-11-01  
Repository: `rudivirawan69-cell/gudangai-rudy-pwa`  
Branch: `rebuild/codegs-v7-foundation`  
Metode: inspeksi statis terhadap `Code.gs` pada default branch. Tidak mengubah spreadsheet produksi.

## Ringkasan keputusan

**Dua fungsi aktif berpotensi menulis kolom F secara langsung:**

1. `syncDivisionStockLightweight_()`
2. `syncDivisionStock(options)`

Keduanya harus dianggap sebagai writer yang memengaruhi `Data Stok Per Divisi!F:F`. Jangan jalankan keduanya di produksi sebelum kebijakan formula kolom F diputuskan dan diuji.

## Bukti fungsi 1 — syncDivisionStockLightweight_

Fungsi membaca stok dari `Stock CV` dan `Stock PT`, lalu meng-override sumber Bahan Baku melalui `applyBahanBakuStockSource_(stockMap)`.

Bagian yang menulis:
- Membaca area A:G dan membandingkan nilai kolom F.
- Memanggil `dest.getRange(u.row, 6).setValue(u.value)` untuk setiap perubahan.
- Memperbarui timestamp di A2.
- Memanggil `clearDataDirty_()`.

**Risiko:** nilai di F ditulis sebagai angka, bukan formula. Bila F sebelumnya berisi formula, fungsi ini menggantinya dengan nilai statis. Edit manual di Stock CV/PT baru tercermin setelah fungsi dijalankan, bukan melalui formula yang selalu mengikuti sumber.

## Bukti fungsi 2 — syncDivisionStock(options)

Fungsi ini:
- Mengambil daftar master dari `Stock Awal`.
- Mengambil angka stok dari `Stock CV` dan `Stock PT`, lalu sumber khusus Bahan Baku.
- Membentuk ulang tabel per divisi.
- Memanggil `dest.getRange(1, 1, oldRows, 7).clearContent()`.
- Memanggil `dest.getRange(1, 1, out.length, 7).setValues(out)`.

**Risiko kritis:** operasi clear dan setValues mencakup kolom F. Formula F yang ada akan terhapus dan diganti nilai angka dalam array `out`. Fungsi juga menulis ulang A:G sehingga bukan sekadar sinkronisasi nilai stok.

## Matriks penulis yang terkonfirmasi

| Fungsi | Operasi pada F | Dampak |
|---|---|---|
| `syncDivisionStockLightweight_` | `setValue` per baris pada kolom 6 | Mengganti formula F dengan angka |
| `syncDivisionStock` | `clearContent` A:G lalu `setValues` A:G | Menghapus formula F dan menulis angka |
| `updateLastUpdateTimestamp` | Belum terbukti menulis F dari potongan yang diaudit | Perlu audit lanjutan pemanggil dan alamat sel |
| `writePurchaseOrder_` | Menulis tabel `purchase order`, bukan kolom F divisi | Tidak termasuk writer F berdasarkan kode yang diperiksa |

## Perubahan yang direkomendasikan — belum diterapkan

1. **Lindungi F dari semua writer layout.** Writer pembentuk tabel hanya boleh menulis A:E dan G, atau menulis A:G dengan formula F yang dipulihkan secara eksplisit dari template tervalidasi. Pilihan lebih aman: jangan pernah clear/setValues pada F.
2. **Jadikan F formula per baris** yang mengambil sumber sesuai entitas/divisi:
   - CV/PT: saldo akhir dari sheet stok yang sesuai.
   - Bahan Baku: saldo akhir dari `Stock Bahan Baku`.
   - Rumus harus menggunakan kode barang kolom B, bukan nomor baris yang mudah bergeser.
3. **Formula harus dipasang dan diverifikasi untuk seluruh master yang valid**, bukan hanya 191 secara asumsi. Bandingkan kode unik Stock Awal dengan kode unik pada Data Stok Per Divisi.
4. **Pisahkan rebuild layout dari refresh saldo.** Rebuild layout tidak boleh dijalankan otomatis oleh trigger transaksi. Refresh saldo tidak boleh menyentuh kolom lain selain F dan timestamp yang disepakati.
5. **Edit manual spreadsheet:** formula F akan mengikuti perubahan manual sumber setelah kalkulasi Sheets. Jika perubahan manual terjadi pada sumber selain Stock CV/PT/Stock Bahan Baku, perlu definisi sumber resmi terlebih dahulu.
6. Tambahkan preflight: validasi sheet, header, kode duplikat, jumlah master, formula count, dan backup range sebelum writer layout dijalankan.
7. Tambahkan postflight: hitung ulang formula F, pastikan tidak ada sel F non-formula pada baris item, dan cocokkan hasil terhadap sumber saldo.

## Syarat sebelum patch produksi

- Pastikan nama tab dan header aktual pada spreadsheet.
- Ambil snapshot/backup Data Stok Per Divisi A:G.
- Uji formula pada salinan spreadsheet, termasuk CV, PT, WK, MM, BBCV, BBPT dan Bahan Baku.
- Uji edit manual pada sumber dan pastikan F berubah tanpa transaksi PWA.
- Uji rebuild layout dan pastikan formula F tetap utuh.
- Baru setelah hasil lulus, buat patch terisolasi dan review diff.

## Status

Audit kode: **terkonfirmasi secara statis**.  
Patch kode: **belum diterapkan**.  
Spreadsheet produksi: **belum disentuh**.  
Deployment Apps Script / Cloudflare: **tidak dilakukan**.
