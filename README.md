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

Membutuhkan Node.js. Jalankan `npm install` sekali di awal untuk memasang dependensi. Sesi login tersimpan di memori server, jadi setiap kali server di-restart, semua orang perlu login lagi.

Secara default aplikasi memakai file SQLite lokal (`data/keuangan.db`) — cocok untuk dipakai sendiri di komputer. Untuk diakses dari luar/internet oleh banyak orang (dashboard transparansi publik), ikuti panduan deploy di bawah.

## Fitur

- **Login multi-user** — dua peran: **Admin** (akses penuh, termasuk kelola user/kategori/kas) dan **Bendahara** (hanya input transaksi, lihat dashboard & laporan). Admin bisa menambah akun bendahara lain lewat menu **Kelola User**.
- **Dashboard** — saldo tiap kas/rekening, total saldo masjid, ringkasan pemasukan/pengeluaran bulan berjalan, transaksi terbaru, dan rekap per kategori.
- **Transaksi** — catat pemasukan (infaq, zakat, sedekah, donasi, dll) dan pengeluaran (operasional, honorarium, kegiatan, dll), lengkap dengan edit, hapus, dan filter berdasarkan tanggal/jenis/kas.
- **Kategori** *(admin)* — kelola daftar kategori pemasukan & pengeluaran sesuai kebutuhan masjid.
- **Kas / Rekening** *(admin)* — kelola beberapa kas (misal Kas Tunai, Rekening Bank) beserta saldo awal masing-masing.
- **Laporan Periode** — laporan berdasarkan rentang tanggal, bisa diexport ke Excel (.xls) atau dicetak/disimpan sebagai PDF.
- **Laporan Tahunan** — rekap 12 bulan (pemasukan, pengeluaran, saldo akhir tiap bulan) plus rekap per kategori untuk satu tahun penuh, bisa dipilih tahunnya, diexport ke Excel, atau dicetak/PDF.
- **Kelola User** *(admin)* — tambah/edit/hapus akun pengguna beserta perannya (Admin/Bendahara).
- **Dashboard Publik Transparansi** — halaman `/transparansi.html`, bisa dibuka siapa saja tanpa login. Menampilkan total saldo, saldo per kas, ringkasan bulan berjalan, dan tren 6 bulan terakhir. Auto-refresh tiap 5 menit, cocok ditampilkan di layar/tablet masjid atau dibagikan linknya ke jamaah.

## Deploy Online Gratis (Render + Turso)

Supaya dashboard transparansi (dan aplikasi secara keseluruhan) bisa diakses dari luar masjid/internet, ikuti langkah berikut. Semua langkah di bawah **perlu Anda lakukan sendiri** (butuh membuat akun) — bagian kode sudah disiapkan.

### 1. Buat database Turso (gratis, tidak perlu kartu kredit)

1. Daftar di **https://turso.tech** (bisa pakai akun GitHub/Google).
2. Setelah masuk dashboard, buat database baru, misal namanya `masjid-al-ghufron`.
3. Di halaman database tersebut, cari **Database URL** (formatnya `libsql://...`) dan buat **Auth Token** baru — catat keduanya, akan dipakai di langkah 3.

### 2. Push kode ke GitHub

1. Buat akun di **https://github.com** kalau belum punya.
2. Buat repository baru (private lebih aman untuk data keuangan), misal `keuangan-masjid-al-ghufron`.
3. Repo lokal ini sudah disiapkan (`git init` + commit pertama sudah dibuat). Hubungkan ke GitHub dan push:
   ```
   git remote add origin https://github.com/USERNAME/keuangan-masjid-al-ghufron.git
   git push -u origin master
   ```
   (Ganti `USERNAME` dan nama repo sesuai punya Anda. GitHub akan minta login/token saat push pertama kali.)

### 3. Deploy ke Render (gratis, tidak perlu kartu kredit)

1. Daftar di **https://render.com** (bisa pakai akun GitHub langsung, lebih cepat).
2. Klik **New +** → **Web Service**, lalu hubungkan ke repo GitHub yang baru dibuat.
3. Render akan otomatis mendeteksi `render.yaml` yang sudah ada di repo ini (Build Command: `npm install`, Start Command: `node server.js`).
4. Sebelum deploy, isi **Environment Variables**:
   - `TURSO_DATABASE_URL` → isi dengan Database URL dari Turso (langkah 1)
   - `TURSO_AUTH_TOKEN` → isi dengan Auth Token dari Turso (langkah 1)
5. Klik **Deploy**. Setelah selesai, Render kasih URL publik (misal `https://keuangan-masjid-al-ghufron.onrender.com`) — ini yang bisa dibagikan ke jamaah, terutama halaman `/transparansi.html`-nya.

**Catatan:**
- Database di Turso mulai kosong (belum ada transaksi) — akun admin default akan otomatis dibuat (`admin` / `admin123`), segera login dan ganti passwordnya, lalu input ulang data kas/kategori/transaksi sesuai kebutuhan (data di komputer lokal Anda tidak otomatis pindah — itu tetap ada terpisah di `data/keuangan.db` lokal).
- Render tier gratis akan "tidur" setelah 15 menit tidak diakses — pengunjung pertama setelah itu akan menunggu ~30 detik saat halaman dimuat, setelahnya normal lagi.
- Setiap kali Anda mengubah kode lagi nanti, commit & push ke GitHub akan otomatis memicu deploy ulang di Render.

## Cadangan Data (Backup)

Seluruh data tersimpan dalam satu file: `data/keuangan.db`. Untuk backup, cukup salin file tersebut ke tempat lain (misal Google Drive/flashdisk) secara berkala.

## Kategori Bawaan

**Pemasukan:** Infaq Jumat, Infaq Harian, Zakat, Sedekah, Donasi Pembangunan, Kotak Amal, Donasi Lainnya

**Pengeluaran:** Operasional (Listrik/Air), Kebersihan, Honorarium (Imam/Khatib/Marbot), Kegiatan & Acara, Pemeliharaan & Perbaikan, Santunan Sosial, Lain-lain

Semua kategori dan kas/rekening bisa diubah/ditambah sendiri lewat menu **Kategori** dan **Kas / Rekening**.
