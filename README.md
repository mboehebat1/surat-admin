# E-Surat — Sistem Administrasi Surat

Aplikasi web administrasi persuratan (e-surat) berbasis **Next.js 16 + TypeScript + PostgreSQL (Drizzle ORM)**.
Mendukung pembuatan surat, alur persetujuan berjenjang, arsip, template dokumen, audit trail, dan laporan.

> Sumber: `web surat 1.zip` (Google Drive) — sudah diekstrak ke root repository ini.

## Fitur

| Modul | Keterangan |
| --- | --- |
| Dashboard | Ringkasan statistik surat, grafik tren, dan surat terbaru |
| Surat | Daftar, detail, buat baru (wizard), edit, duplikat, unduh PDF/DOCX |
| Persetujuan | Antrian persetujuan berjenjang (pembuat → pemeriksa → pejabat) |
| Alur Persetujuan | Konfigurasi workflow persetujuan |
| Template | Template surat, duplikasi template, render dengan data surat |
| Arsip | Pencarian & penyaringan surat terarsip |
| Monitoring | Pemantauan status surat lintas unit |
| Laporan | Rekap surat + ekspor berkas |
| Pengguna & Departemen | Manajemen akun, peran, dan unit kerja |
| Audit Trail | Catatan aktivitas pengguna atas dokumen |
| Notifikasi | Pemberitahuan tugas persetujuan / perubahan status |

## Format Placeholder

Template surat memakai placeholder untuk field dinamis. Empat format berikut
didukung dan boleh dicampur dalam satu naskah:

| Format | Contoh | Keterangan |
| --- | --- | --- |
| `{{field}}` | `{{perihal}}` | Format standar aplikasi |
| `<<field>>` | `<<perihal>>` | Lazim dipakai template Word lama |
| `${field}` | `${perihal}` | Gaya ekspresi / template Excel |
| `[field]` | `[nama_kegiatan]` | Harus huruf kecil bergaris bawah |

Aturan penulisan:

- Nama field boleh berisi huruf, angka, garis bawah, dan titik (`{{data.instansi}}`).
- Spasi di dalam kurung diabaikan: `{{ perihal }}` = `{{perihal}}`.
- Untuk `[field]`, hanya nama berbentuk `snake_case` (minimal satu garis bawah)
  atau nama field sistem yang dikenali. Ini mencegah teks biasa seperti
  `[1]`, `[catatan]`, atau `[tautan](url)` ikut terbaca sebagai placeholder.
- Placeholder terdeteksi otomatis dari naskah maupun dokumen DOCX
  (termasuk header/footer, dan tag yang terpecah antar-run oleh Word).
- Saat ekspor DOCX, semua format dinormalkan ke `{{field}}` lebih dulu, dan
  template lama bergaya `{field}` tunggal tetap didukung.

Field sistem yang tersedia: `nomor_surat`, `tanggal_surat`, `tanggal_lengkap`,
`nama_penerima`, `jabatan_penerima`, `alamat_penerima`, `perihal`, `isi_surat`,
`nama_pembuat`, `jabatan_pembuat`, `nama_penandatangan`, `jabatan_penandatangan`,
`nip_penandatangan`, `lampiran`, `klasifikasi`, `kop_surat`.

Logika placeholder berada di `src/lib/placeholders.ts` (dipakai server dan client).

## Teknologi

- Next.js 16 (App Router) + React 19
- TypeScript, Tailwind CSS 4, Recharts, Lucide
- PostgreSQL + Drizzle ORM
- Autentikasi JWT (`jose`) + `bcryptjs`
- Pembuatan dokumen: `pdfkit`, `docx`, `docxtemplater` + `pizzip`

## Prasyarat

- Node.js 20+
- PostgreSQL 14+ (database `app_db`)

## Konfigurasi

Salin `.env.example` menjadi `.env`, lalu sesuaikan:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
AUTH_SECRET=ganti-dengan-string-acak-panjang
STORAGE_DIR=./storage
```

## Menjalankan

```bash
npm install
npm run dev        # mode pengembangan  -> http://localhost:3000
```

Mode produksi:

```bash
npm run build
npm start
```

Skema database dibuat otomatis saat aplikasi pertama kali berjalan (`src/instrumentation.ts`),
begitu pula data awal (pengguna, template, alur persetujuan, contoh surat) dari `src/lib/seed.ts`.

### Halaman login & berita

Halaman login menampilkan **berita terkini** (bukan lagi daftar akun demo). Berita dikelola
oleh **Super Admin** melalui menu **Berita & Pengumuman** di dasbor: tambah, ubah, hapus,
terbitkan/draft, sematkan di urutan teratas, serta pilih kategori (Pengumuman / Berita /
Pemeliharaan). Hanya berita berstatus *terbit* yang tampil di halaman login.

### Pengguna demo

Daftar akun demo tidak lagi ditampilkan di halaman login. Semua akun memakai kata sandi: **`surat123`**

| Email | Peran |
| --- | --- |
| `superadmin@esurat.local` | Super Admin |
| `admin@esurat.local` | Admin Persuratan |
| `pembuat@esurat.local` | Pembuat Surat |
| `pembuat2@esurat.local` | Pembuat Surat (unit lain) |
| `pemeriksa@esurat.local` | Pemeriksa |
| `pejabat@esurat.local` | Pejabat / Pimpinan |

### Skrip Windows (opsional)

- `jalankan.bat` — sekali klik: cek Node.js, buat `.env`, `npm install`, siapkan database, build, start, buka browser.
  Varian: `jalankan.bat dev`, `jalankan.bat rebuild`.
- `e-surat.bat` — menu utilitas aplikasi.
- `backup-e-surat.bat` — backup database & folder penyimpanan.

## Struktur Proyek

```
src/
├── app/
│   ├── (app)/           # halaman ber-autentikasi
│   │   ├── dashboard/   # ringkasan
│   │   ├── surat/       # daftar, detail, baru, edit
│   │   ├── persetujuan/ # antrian persetujuan
│   │   ├── alur/        # konfigurasi workflow
│   │   ├── berita/      # berita & pengumuman (tampil di halaman login)
│   │   ├── template/    # template surat
│   │   ├── arsip/       # arsip surat
│   │   ├── monitoring/  # monitoring status
│   │   ├── laporan/     # laporan & ekspor
│   │   ├── pengguna/    # manajemen pengguna
│   │   └── audit/       # audit trail
│   ├── api/             # REST API (auth, letters, templates, users, dll.)
│   └── login/           # halaman login
├── components/          # komponen UI (shell, table, wizard, preview, charts)
├── db/                  # koneksi & skema Drizzle
└── lib/                 # auth, workflow, storage, documents, queries, seed
```

## Lisensi

Proyek internal. Silakan sesuaikan.
