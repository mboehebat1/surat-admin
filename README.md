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

### Pengguna demo

Semua akun memakai kata sandi: **`surat123`**

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
