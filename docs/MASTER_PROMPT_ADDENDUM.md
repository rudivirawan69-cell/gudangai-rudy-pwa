# ADDENDUM WAJIB — STABILITAS KONEKSI, ANTI-TIMEOUT, EKSEKUSI CEPAT, DAN ANTI-DUPLIKASI

Instruksi ini merupakan prioritas utama untuk seluruh pekerjaan backend, PWA, API, Google Apps Script, dan sinkronisasi spreadsheet GudangAI-69.

## 1. Target utama

Urutan prioritas teknis:

1. **Ketepatan data dan keselamatan stok.**
2. **Koneksi stabil antara PWA, backend, dan spreadsheet.**
3. **Tidak ada transaksi ganda, transaksi hilang, atau sukses palsu.**
4. **Meminimalkan timeout dan kegagalan layanan.**
5. **Mempercepat pemrosesan melalui optimasi yang terukur.**
6. Mempertahankan seluruh validasi dan aturan pembacaan PDF/foto yang sudah berlaku.

Jangan mengejar kecepatan dengan menghilangkan validasi, melewati verifikasi penulisan, mematikan idempotensi, atau mengubah aturan stok.

## 2. Audit penyebab timeout sebelum melakukan optimasi

Periksa seluruh jalur eksekusi untuk menemukan operasi lambat atau berulang, termasuk:

- Pemanggilan Google Sheets/Drive yang dilakukan satu per satu.
- Pembacaan spreadsheet berulang untuk setiap item transaksi.
- Pemanggilan `flush()` yang tidak diperlukan.
- Pemindaian seluruh sheet pada setiap request.
- Penggunaan cache yang menyebabkan data kedaluwarsa atau tidak konsisten.
- Pengambilan master barang berulang kali.
- Lock yang ditahan terlalu lama.
- Retry tanpa batas atau retry yang terlalu cepat.
- Pemrosesan OCR/PDF yang menahan jalur transaksi utama.
- Request frontend yang menggantung karena tidak memiliki penanganan batas waktu.
- Operasi sinkron yang tidak diperlukan.
- Endpoint atau deployment yang lambat, tidak konsisten, atau salah konfigurasi.

Gunakan log waktu untuk mengukur durasi setiap tahap. Jangan menebak penyebab timeout hanya berdasarkan gejala.

Catat setidaknya:

`request_received → validation_start → validation_end → lock_acquired → write_start → write_end → verification_end → response_sent`

Jangan memasukkan token, kredensial, atau data sensitif ke log.

## 3. Optimasi `bulkTransaction`

Pertahankan fungsi dan kontrak produksi yang telah terverifikasi. Jangan mengganti seluruh implementasi tanpa bukti akar masalah.

Lakukan optimasi berikut jika sesuai dengan kode aktual:

- Validasi seluruh payload secara efisien sebelum penulisan.
- Kelompokkan pembacaan master data agar tidak dilakukan berulang kali untuk setiap item.
- Gunakan operasi batch untuk penulisan jika struktur dan urutan transaksi tetap aman.
- Hindari pembacaan seluruh spreadsheet ketika hanya sejumlah kecil baris yang diperlukan.
- Kurangi operasi Google Apps Script yang berulang.
- Minimalkan durasi lock.
- Pisahkan proses persiapan data dari bagian kritis yang melakukan penulisan.
- Jangan melakukan operasi jaringan atau pemrosesan PDF berat saat lock transaksi sedang dipegang.
- Pastikan hasil setiap item dapat dilacak dan diverifikasi.
- Hindari penulisan parsial yang dilaporkan sebagai keberhasilan seluruh batch.

Jangan melakukan penulisan paralel ke spreadsheet secara agresif. Optimalkan jumlah operasi dan waktu eksekusi, bukan dengan menimbulkan persaingan penulisan.

## 4. Strategi anti-timeout yang aman

Bedakan tiga kondisi:

**A. Gagal sebelum penulisan**

Jika dapat dibuktikan belum ada perubahan data, kembalikan kegagalan yang jelas. Retry boleh dilakukan sesuai kebijakan.

**B. Penulisan berhasil dan hasilnya terverifikasi**

Kembalikan sukses beserta identitas transaksi dan hasil per item yang sesuai kontrak.

**C. Timeout atau koneksi terputus setelah penulisan mungkin terjadi**

Jangan langsung mengirim ulang transaksi sebagai transaksi baru. Cari status berdasarkan identitas request atau item, lalu lakukan rekonsiliasi.

Jika status belum dapat dipastikan, tandai sebagai pending/unknown sesuai kontrak sistem. Jangan melaporkan sukses atau gagal secara pasti tanpa bukti.

Tetapkan timeout dan batas retry berdasarkan batas layanan aktual, bukan angka sembarang. Semua retry harus terbatas, memiliki jeda yang sesuai, dan mempertahankan identitas transaksi yang sama.

## 5. Jaminan anti-duplikasi

Terapkan idempotensi pada sisi backend, bukan hanya dengan menonaktifkan tombol frontend.

- Satu item logis memiliki ID stabil.
- Retry untuk item yang sama harus menggunakan ID yang sama.
- Dua item berbeda harus memiliki ID berbeda meskipun kode barangnya sama.
- Periksa status ledger sebelum melakukan penulisan ulang.
- Tangani request bersamaan dengan mekanisme locking atau reservasi ID yang benar.
- Pastikan status ledger diperbarui secara konsisten dengan hasil penulisan.
- Jangan menganggap keberadaan ID di ledger membuktikan baris transaksi sudah tersimpan.
- Jika terjadi timeout, rekonsiliasi sebelum mencoba menulis ulang.
- Jika sebuah batch hanya berhasil sebagian, jangan mengulang seluruh batch tanpa mengidentifikasi item yang sudah berhasil.
- Antrean offline tidak boleh menghapus item sebelum hasil akhirnya dapat dipastikan.

Jangan mengklaim jaminan *exactly-once* hanya karena memakai ID request. Buktikan perilaku idempotensi terhadap timeout, request paralel, dan respons yang hilang.

## 6. Koneksi PWA dan pemulihan jaringan

Audit API client, endpoint, konfigurasi backend, dan service worker.

Pastikan:

- PWA menggunakan endpoint produksi yang benar.
- Konfigurasi Vercel dan Cloudflare tidak tercampur secara tidak sengaja.
- Tidak ada fallback diam-diam ke backend atau URL lama.
- Respons HTTP, JSON, dan error jaringan diperiksa secara benar.
- Request yang gagal tidak diubah menjadi status sukses.
- Request berulang tidak dibuat oleh beberapa handler, efek React, atau listener yang terdaftar ganda.
- Tombol simpan mencegah klik ganda, tetapi retry backend tetap menggunakan ID transaksi yang sama.
- Antrean offline tetap bertahan setelah aplikasi ditutup atau halaman dimuat ulang, sesuai mekanisme penyimpanan yang sudah ada.
- Saat koneksi pulih, antrean dikirim dengan retry terbatas dan rekonsiliasi status.
- Pesan kepada pengguna membedakan sukses, gagal, dan status belum diketahui.

Gunakan pemeriksaan konektivitas yang benar-benar menguji endpoint jika diperlukan. Status browser “online” saja tidak membuktikan backend dapat dijangkau.

## 7. Kecepatan eksekusi berdasarkan pengukuran

Sebelum dan sesudah patch, ukur:

- Durasi validasi.
- Durasi pembacaan master data.
- Durasi lock.
- Durasi penulisan.
- Durasi verifikasi.
- Total waktu request.
- Persentase timeout.
- Tingkat keberhasilan transaksi.
- Jumlah transaksi ganda.
- Jumlah item yang hilang atau pending.

Uji dengan batch kecil, batch normal, dan batch besar sesuai batas aktual sistem. Tentukan batas ukuran batch berdasarkan hasil pengujian, kuota layanan, dan waktu eksekusi yang tersedia.

Jangan menjanjikan latensi tertentu sebelum ada hasil pengukuran. Laporkan median dan persentil tinggi jika jumlah pengujian cukup untuk menghasilkan ukuran yang bermakna.

## 8. PDF/foto tetap terpisah dari jalur transaksi kritis

Pertahankan seluruh aturan parsing PDF/foto yang sudah ada.

- Proses ekstraksi dokumen di jalur persiapan data.
- Validasi nama barang dan Qty sebelum pengguna mengonfirmasi transaksi.
- Jangan menulis transaksi saat OCR atau parsing masih berjalan.
- Jangan mengirim ulang transaksi hanya karena proses OCR gagal atau preview tidak tampil.
- Setelah pengguna mengonfirmasi hasil, gunakan mekanisme transaksi yang sama dan idempotensi yang sama seperti input manual.
- Jangan mengubah urutan, penggabungan duplikat, kolom Qty, atau normalisasi nama barang tanpa regression test.

Optimasi parsing dokumen tidak boleh menurunkan ketepatan ekstraksi demi kecepatan.

## 9. Pengujian ketahanan wajib

Jalankan pengujian pada lingkungan aman:

1. Request normal dengan satu item.
2. Batch beberapa item.
3. Batch berukuran besar yang masih dalam batas sistem.
4. Request identik dikirim dua kali.
5. Dua request identik dikirim bersamaan.
6. Koneksi terputus sebelum penulisan.
7. Koneksi terputus setelah penulisan tetapi sebelum respons diterima.
8. Timeout layanan Google.
9. Lock tidak segera tersedia.
10. Respons backend tidak valid.
11. Antrean offline dipulihkan setelah aplikasi dibuka ulang.
12. Satu batch berisi item valid dan invalid.
13. PDF berhasil dibaca tetapi pengguna belum mengonfirmasi.
14. Retry setelah sebagian item batch berhasil.
15. PWA dan backend menggunakan konfigurasi deployment yang berbeda.

Untuk setiap tes, catat hasil aktual, durasi, status per item, dan bukti bahwa tidak ada duplikasi atau kehilangan data.

## 10. Larangan perubahan berisiko

Jangan:

- Menghapus `bulkTransaction` yang sudah bekerja tanpa bukti masalah.
- Mengubah struktur atau rumus Stock CV/PT.
- Menulis langsung ke Stock CV/PT dari jalur transaksi.
- Menghilangkan validasi untuk mempercepat proses.
- Menambahkan retry tanpa batas.
- Menggunakan ID baru setiap kali melakukan retry.
- Menandai transaksi sukses sebelum hasilnya dapat dipastikan.
- Menghapus antrean ketika status transaksi masih tidak diketahui.
- Menjalankan penulisan paralel yang dapat menghasilkan kondisi balapan.
- Mengubah seluruh UI ketika akar masalah berada di backend.
- Mengganti parser PDF tanpa mempertahankan regression test.
- Mengklaim sistem bebas timeout; timeout eksternal tidak selalu dapat dihilangkan, tetapi dampaknya harus ditangani dengan aman.

## 11. Kriteria penerimaan

P0 hanya dinyatakan lulus jika:

- `bulkTransaction` lulus tes transaksi valid dan batch.
- Penulisan diverifikasi pada sheet transaksi yang benar.
- Retry dan request paralel tidak membuat transaksi ganda dalam skenario yang diuji.
- Timeout tidak menyebabkan penulisan ulang secara membabi buta.
- Status pending dapat direkonsiliasi.
- Validasi tetap akurat.
- Tidak ada penulisan terlarang ke Stock CV/PT.
- Tidak ada regresi pada aturan PDF/foto yang sudah ada.
- Build dan tes regresi lulus.
- Hasil pengujian dan commit dapat diperiksa.
- Status deployment Apps Script dan PWA dilaporkan terpisah dan sesuai bukti.

Mulai dengan mengukur dan menemukan akar masalah. Terapkan perubahan minimal yang dapat dibuktikan. Prioritaskan kebenaran data, stabilitas koneksi, anti-duplikasi, dan pengurangan waktu eksekusi yang terukur.

### Urutan eksekusi yang harus Claude ikuti

- P0: `bulkTransaction` dan validasi backend.
- P0: idempotensi, timeout, retry, dan sinkronisasi spreadsheet.
- P1: seluruh fungsi input PWA.
- P1: pembacaan PDF/foto beserta regression test.
- P2: Dashboard, Status PO, dan akses deployment.
- P3: UI dan optimasi tampilan yang tidak mengganggu transaksi.

Catatan: tidak ada sistem yang bisa dijamin tidak pernah timeout akibat gangguan eksternal. Sasaran yang realistis adalah mengurangi penyebab timeout, mempercepat operasi yang terbukti lambat, serta memastikan timeout tidak menimbulkan transaksi ganda atau kehilangan data.
