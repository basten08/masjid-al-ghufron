# Aplikasi Keuangan Masjid Al-Ghufron

Aplikasi web lokal untuk mencatat arus kas masjid (pemasukan, pengeluaran, saldo, dan laporan). Berjalan di komputer sendiri, data tersimpan di file lokal `data/keuangan.db` — tidak butuh internet maupun install database terpisah.

## Cara Menjalankan

1. Buka terminal di folder ini.
2. Jalankan:
   ```
   node server.js
   ```
3. Buka browser ke: `http://localhost:4321`
4. Login dengan akun default:
   - **Username:** `admin`
   - **Password:** `admin123`

   Segera ganti password default ini lewat tombol **Ganti Password** setelah login pertama kali.
5. Biarkan terminal tetap terbuka selama aplikasi dipakai. Tutup terminal (Ctrl+C) untuk mematikan aplikasi.

Membutuhkan Node.js v22.5 ke atas (memakai modul SQLite bawaan Node, jadi tidak perlu `npm install`). Sesi login tersimpan di memori server, jadi setiap kali server di-restart (`node server.js` dijalankan ulang), semua orang perlu login lagi.

## Fitur

- **Login multi-user** — dua peran: **Admin** (akses penuh, termasuk kelola user/kategori/kas) dan **Bendahara** (hanya input transaksi, lihat dashboard & laporan). Admin bisa menambah akun bendahara lain lewat menu **Kelola User**.
- **Dashboard** — saldo tiap kas/rekening, total saldo masjid, ringkasan pemasukan/pengeluaran bulan berjalan, transaksi terbaru, dan rekap per kategori.
- **Transaksi** — catat pemasukan (infaq, zakat, sedekah, donasi, dll) dan pengeluaran (operasional, honorarium, kegiatan, dll), lengkap dengan edit, hapus, dan filter berdasarkan tanggal/jenis/kas.
- **Kategori** *(admin)* — kelola daftar kategori pemasukan & pengeluaran sesuai kebutuhan masjid.
- **Kas / Rekening** *(admin)* — kelola beberapa kas (misal Kas Tunai, Rekening Bank) beserta saldo awal masing-masing.
- **Laporan Periode** — laporan berdasarkan rentang tanggal, bisa diexport ke Excel (.xls) atau dicetak/disimpan sebagai PDF.
- **Laporan Tahunan** — rekap 12 bulan (pemasukan, pengeluaran, saldo akhir tiap bulan) plus rekap per kategori untuk satu tahun penuh, bisa dipilih tahunnya, diexport ke Excel, atau dicetak/PDF.
- **Kelola User** *(admin)* — tambah/edit/hapus akun pengguna beserta perannya (Admin/Bendahara).

## Cadangan Data (Backup)

Seluruh data tersimpan dalam satu file: `data/keuangan.db`. Untuk backup, cukup salin file tersebut ke tempat lain (misal Google Drive/flashdisk) secara berkala.

## Kategori Bawaan

**Pemasukan:** Infaq Jumat, Infaq Harian, Zakat, Sedekah, Donasi Pembangunan, Kotak Amal, Donasi Lainnya

**Pengeluaran:** Operasional (Listrik/Air), Kebersihan, Honorarium (Imam/Khatib/Marbot), Kegiatan & Acara, Pemeliharaan & Perbaikan, Santunan Sosial, Lain-lain

Semua kategori dan kas/rekening bisa diubah/ditambah sendiri lewat menu **Kategori** dan **Kas / Rekening**.
