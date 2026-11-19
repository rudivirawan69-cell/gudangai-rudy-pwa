# Agent Rubee — Code.gs Knowledge Index & Read-only Spreadsheet Bridge

## Tujuan

Agent menggabungkan dua sumber pengetahuan yang berbeda:

1. **Source Code.gs dari repository** — diindeks otomatis saat build menjadi potongan kode yang dapat dicari. Setiap jawaban dapat mengembalikan knowledgeSources dengan nama file, fungsi/section, nomor chunk, versi, SHA-256, dan ref build.
2. **Spreadsheet live melalui Apps Script** — hanya dibaca ketika pertanyaan membutuhkan data aktual. Hasil menyertakan action, sumber, dan waktu baca; bukan sinkronisasi seluruh spreadsheet secara terus-menerus.

Source Code.gs di GitHub adalah snapshot repository, bukan bukti bahwa versi yang sama sudah terpasang di Apps Script Web App.

## Cara kerja indeks Code.gs

- scripts/build-agent-knowledge.mjs membaca seluruh Code.gs, memecahnya menjadi chunk ber-overlap, menghitung SHA-256, dan menghasilkan cloudflare/generated/code-knowledge.js.
- File generated dibuat ulang oleh npm run build dan npm run test:agent; jangan diedit manual.
- Worker mengambil maksimal 3 chunk yang paling relevan dengan pertanyaan. Anggaran prompt untuk potongan kode maksimal sekitar 6.500 karakter.
- Jika Code.gs berubah, indeks ikut berubah pada build berikutnya. Tidak ada secret atau data spreadsheet yang disimpan di indeks kode.

## Gateway Apps Script read-only

Action baru: getAgentKnowledge, tersedia hanya melalui Worker setelah verifikasi Supabase bearer token dan allowlist action.

| Mode | Fungsi | Batas |
|---|---|---|
| manifest | Daftar tab, ID, jumlah baris/kolom, baris header yang terdeteksi, header kolom, status hidden | Scan 8 baris awal; header maksimal 100 kolom |
| search | Cari kata kunci lintas tab operasional | Maksimal 5 istilah, 4 baris per istilah, 40 hasil; default 24 |
| page | Baca rentang tertentu dari satu tab | Maksimal 50 baris × 30 kolom per aksi |

Paginasi menggunakan startRow dan startColumn. Respons page mengembalikan nextStartRow dan nextStartColumn; Agent dapat meminta halaman berikutnya bila perlu. Formula hanya dikembalikan saat includeFormulas: true.

**Perlindungan data:**
- Config dan System Log tidak dapat dibaca melalui pencarian atau page umum.
- Manifest hanya mengirim header terpilih, bukan contoh baris transaksi.
- Action tidak memiliki operasi tulis. Tidak ada setValue, appendRow, edit formula, transaksi, PO write, delete, atau ganti periode.
- Maksimal dua aksi live per pertanyaan; pertanyaan khusus struktur/isi spreadsheet diprioritaskan menjadi satu aksi knowledge.
- Anggaran konteks data live maksimal sekitar 9.000 karakter. Hasil lebih besar dipotong dan harus diperlakukan sebagai hasil parsial.
- Riwayat transaksi pada action khusus yang sudah ada tetap dibatasi hingga 100 baris.

## Contoh pertanyaan

- "Daftar semua tab spreadsheet utama" → manifest.
- "Cari rumus Stock Akhir dan formula perhitungan stok" → search dengan formula.
- "Baca Stock CV baris 11 kolom 31" → page mulai baris 11, kolom 31.
- "Cari kode barang pada semua tab operasional" → search.

## Environment Worker

Atur hanya melalui secret/variable Cloudflare, bukan file frontend dan bukan Git:

- GUDANGAI_SHEETS_API_URL: URL Apps Script Web App /exec berawalan https://.
- GUDANGAI_SHEETS_API_SECRET: secret yang cocok dengan Script Properties backend.
- Supabase URL dan publishable/anon key tetap menjadi konfigurasi runtime untuk verifikasi sesi.

Jika URL atau secret gateway tidak tersedia, health melaporkan dataToolsConfigured: false; Agent tidak boleh mengklaim telah membaca spreadsheet live.

## Aktivasi dan deployment

### A. GitHub / Cloudflare Worker

1. Jalankan CI pada PR: npm run test:agent, validasi sintaks Code.gs/Worker, dan npm run build.
2. Merge hanya setelah pemeriksaan wajib lulus.
3. Pipeline produksi Cloudflare berjalan pada merge ke main, menggunakan target yang ditetapkan di wrangler.jsonc.
4. Verifikasi endpoint /api/agent/health dan pastikan metadata codeKnowledgeIndexed, versi, SHA-256, dan jumlah chunk tersedia.

### B. Apps Script Web App (langkah terpisah)

Merge GitHub tidak otomatis menerbitkan Apps Script. Untuk mengaktifkan getAgentKnowledge live:

1. Buka project Apps Script yang saat ini menjadi deployment Web App untuk spreadsheet utama.
2. Ambil Code.gs dari branch/commit PR yang sudah disetujui; jangan mengambil file dari branch lain.
3. Terapkan perubahan hanya pada source Apps Script. Jangan mengubah data sheet, formula, trigger, Script Properties, atau struktur spreadsheet sebagai bagian dari pemasangan action ini.
4. Pastikan Script Property API_SECRET yang sudah ada tetap tersimpan; jangan menyalin nilainya ke Git atau chat.
5. Simpan, jalankan pemeriksaan sintaks, lalu Deploy → Manage deployments → Edit Web App → New version → Deploy sesuai konfigurasi akses internal yang sudah berlaku.
6. Jangan membuat deployment publik baru atau memperluas izin akses hanya untuk mengaktifkan Agent.
7. Uji melalui Worker dengan akun operator terautentikasi: manifest, pencarian, pembacaan page, dan penolakan Config/System Log.
8. Pastikan semua respons bertanda readOnly: true dan tidak ada perubahan nilai, formula, atau jumlah baris spreadsheet.

Jangan menganggap live spreadsheet retrieval aktif hanya karena Worker sudah ter-deploy. Endpoint Apps Script harus sudah memakai versi Code.gs yang memuat dispatcher getAgentKnowledge.

## Batas kemampuan yang tetap berlaku

- Ini bukan snapshot seluruh isi spreadsheet yang selalu disuntikkan ke AI. Data operasional diambil on-demand.
- Satu pertanyaan tidak dapat memuat seluruh ratusan/ribuan baris. Gunakan pencarian dan paginasi berdasarkan kebutuhan.
- Hasil yang terpotong, kosong, gagal, atau berasal dari snapshot lama wajib disebutkan.
- Agent hanya memiliki hak baca. Untuk menulis, diperlukan desain terpisah dengan role/approval, allowlist range, audit, idempotency, dan read-back; fitur itu tidak termasuk dalam integrasi ini.
