/**
 * Blueprint naskah template persuratan standar.
 *
 * Dipakai oleh:
 * - `src/lib/seed.ts` (instalasi baru), dan
 * - `POST /api/templates/presets` (tombol "Template standar" pada halaman Template Surat),
 *   sehingga database yang sudah berjalan tetap bisa memuat / memperbarui naskah ini.
 *
 * File ini sengaja bebas akses database agar aman diimpor komponen klien.
 */

export type PresetField = {
  key: string;
  label: string;
  type?: string;
  isRequired?: boolean;
  helpText?: string;
  placeholder?: string;
};

export type TemplatePreset = {
  code: string;
  name: string;
  categoryCode: string | null;
  description: string;
  signerName: string;
  signerPosition: string;
  numberingFormat: string;
  kopText: string;
  body: string;
  fields: PresetField[];
};

/** Format nomor surat standar: 001/SD/ESRT/XI/2026 */
export const DEFAULT_NUMBER_FORMAT = "{nomor}/{kode}/{org}/{bulan}/{tahun}";

/** Kop surat bawaan: baris 1 instansi, baris 2 unit kerja, sisanya alamat & kontak. */
export const DEFAULT_KOP = [
  "PEMERINTAH PROVINSI JAWA BARAT",
  "DINAS PENDIDIKAN DAN KEBUDAYAAN",
  "Jalan Dr. Radjiman No. 6, Bandung 40171",
  "Telepon (022) 4234168 · Faksimile (022) 4207341",
  "Laman disdik.jabarprov.go.id · Surel surat@disdik.jabarprov.go.id",
].join("\n");

const SERTA = "Demikian surat ini disampaikan. Atas perhatian dan kerja sama Bapak/Ibu, kami ucapkan terima kasih.";

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    code: "TPL-SD",
    name: "Template Surat Dinas Standar",
    categoryCode: "SD",
    description: "Surat kedinasan umum: pemberitahuan, permohonan, dan penyampaian informasi",
    signerName: "Dr. Ahmad Fauzi, M.Pd.",
    signerPosition: "Kepala Dinas Pendidikan dan Kebudayaan",
    numberingFormat: DEFAULT_NUMBER_FORMAT,
    kopText: DEFAULT_KOP,
    body: [
      "Sehubungan dengan {{perihal_kegiatan}} yang dilaksanakan oleh {{unit_kerja}} pada Tahun Anggaran {{tahun_anggaran}}, dengan ini kami sampaikan hal-hal sebagai berikut:",
      "1. {{poin_pertama}}",
      "2. {{poin_kedua}}",
      "3. {{poin_ketiga}}",
      SERTA,
    ].join("\n\n"),
    fields: [
      { key: "perihal_kegiatan", label: "Perihal Kegiatan", isRequired: true, placeholder: "Contoh: pelaksanaan verifikasi data pegawai" },
      { key: "unit_kerja", label: "Unit Kerja", isRequired: true, placeholder: "Contoh: Bagian Akademik" },
      { key: "tahun_anggaran", label: "Tahun Anggaran", type: "number", isRequired: true, placeholder: "Contoh: 2026" },
      { key: "poin_pertama", label: "Butir 1", type: "textarea", isRequired: true, helpText: "Poin utama surat, tulis satu kalimat lengkap." },
      { key: "poin_kedua", label: "Butir 2", type: "textarea", isRequired: true },
      { key: "poin_ketiga", label: "Butir 3", type: "textarea", helpText: "Opsional, kosongkan bila hanya dua butir." },
    ],
  },
  {
    code: "TPL-UD",
    name: "Template Surat Undangan Kegiatan",
    categoryCode: "UD",
    description: "Undangan rapat, sosialisasi, dan kegiatan kedinasan lainnya",
    signerName: "Siti Rahmawati, S.E.",
    signerPosition: "Kepala Bagian Persuratan",
    numberingFormat: DEFAULT_NUMBER_FORMAT,
    kopText: DEFAULT_KOP,
    body: [
      "Dalam rangka {{nama_kegiatan}}, kami mengharap kehadiran Bapak/Ibu pada:",
      "Hari, tanggal: {{hari_tanggal}}",
      "Waktu: {{waktu}}",
      "Tempat: {{tempat}}",
      "Agenda: {{agenda}}",
      "Mengingat pentingnya agenda tersebut, kami mohon Bapak/Ibu berkenan hadir tepat waktu serta membawa dokumen pendukung yang diperlukan.",
      "Demikian undangan ini disampaikan. Atas perhatian dan kehadiran Bapak/Ibu, kami ucapkan terima kasih.",
    ].join("\n\n"),
    fields: [
      { key: "nama_kegiatan", label: "Nama Kegiatan", isRequired: true, placeholder: "Contoh: Rapat koordinasi penyusunan program kerja" },
      { key: "hari_tanggal", label: "Hari, Tanggal", isRequired: true, placeholder: "Contoh: Senin, 12 Januari 2026" },
      { key: "waktu", label: "Waktu", isRequired: true, placeholder: "Contoh: 09.00 WIB s.d. selesai" },
      { key: "tempat", label: "Tempat", isRequired: true, placeholder: "Contoh: Ruang Rapat Utama, Gedung A Lt. 2" },
      { key: "agenda", label: "Agenda", type: "textarea", isRequired: true, placeholder: "Contoh: Pembahasan rencana kegiatan triwulan I" },
    ],
  },
  {
    code: "TPL-SK",
    name: "Template Surat Keterangan",
    categoryCode: "SK",
    description: "Keterangan pegawai: keaktifan, penghasilan, dan keperluan administratif lain",
    signerName: "Dr. Ahmad Fauzi, M.Pd.",
    signerPosition: "Kepala Dinas Pendidikan dan Kebudayaan",
    numberingFormat: DEFAULT_NUMBER_FORMAT,
    kopText: DEFAULT_KOP,
    body: [
      "Yang bertanda tangan di bawah ini, {{jabatan_penandatangan}} {{instansi}}, dengan ini menerangkan bahwa:",
      "Nama: {{nama_ybs}}",
      "NIP/NIK: {{nomor_identitas}}",
      "Jabatan: {{jabatan_ybs}}",
      "Unit kerja: {{unit_kerja}}",
      "Bahwa yang bersangkutan benar {{isi_keterangan}}.",
      "Surat keterangan ini dibuat untuk keperluan {{keperluan}} dan dapat dipergunakan sebagaimana mestinya.",
    ].join("\n\n"),
    fields: [
      { key: "instansi", label: "Nama Instansi", isRequired: true, placeholder: "Contoh: Dinas Pendidikan dan Kebudayaan Provinsi Jawa Barat" },
      { key: "nama_ybs", label: "Nama yang Diterangkan", isRequired: true },
      { key: "nomor_identitas", label: "NIP / NIK", isRequired: true },
      { key: "jabatan_ybs", label: "Jabatan", isRequired: true },
      { key: "unit_kerja", label: "Unit Kerja", isRequired: true },
      { key: "isi_keterangan", label: "Isi Keterangan", type: "textarea", isRequired: true, placeholder: "Contoh: pegawai aktif pada instansi kami sejak tahun 2015" },
      { key: "keperluan", label: "Keperluan", isRequired: true, placeholder: "Contoh: kelengkapan berkas kenaikan pangkat" },
    ],
  },
  {
    code: "TPL-ST",
    name: "Template Surat Tugas",
    categoryCode: "ST",
    description: "Penugasan pegawai untuk kegiatan dinas, perjalanan dinas, dan tim kerja",
    signerName: "Dr. Ahmad Fauzi, M.Pd.",
    signerPosition: "Kepala Dinas Pendidikan dan Kebudayaan",
    numberingFormat: DEFAULT_NUMBER_FORMAT,
    kopText: DEFAULT_KOP,
    body: [
      "Yang bertanda tangan di bawah ini, {{jabatan_penandatangan}} {{instansi}}, dengan ini menugaskan kepada:",
      "Nama: {{nama_petugas}}",
      "NIP: {{nip_petugas}}",
      "Jabatan: {{jabatan_petugas}}",
      "Untuk melaksanakan {{tujuan_tugas}} dengan rincian sebagai berikut:",
      "Hari, tanggal: {{tanggal_pelaksanaan}}",
      "Tempat: {{tempat_tugas}}",
      "Yang bersangkutan wajib melaksanakan tugas dengan penuh tanggung jawab serta menyampaikan laporan hasil pelaksanaan tugas kepada atasan langsung.",
      "Demikian surat tugas ini dibuat untuk dilaksanakan sebagaimana mestinya.",
    ].join("\n\n"),
    fields: [
      { key: "instansi", label: "Nama Instansi", isRequired: true },
      { key: "nama_petugas", label: "Nama Petugas", isRequired: true },
      { key: "nip_petugas", label: "NIP Petugas", isRequired: true },
      { key: "jabatan_petugas", label: "Jabatan Petugas", isRequired: true },
      { key: "tujuan_tugas", label: "Tujuan Penugasan", isRequired: true, placeholder: "Contoh: pendampingan verifikasi data sekolah" },
      { key: "tanggal_pelaksanaan", label: "Tanggal Pelaksanaan", isRequired: true, placeholder: "Contoh: 12 s.d. 14 Januari 2026" },
      { key: "tempat_tugas", label: "Tempat Tugas", isRequired: true },
    ],
  },
  {
    code: "TPL-SM",
    name: "Template Lembar Disposisi Surat Masuk",
    categoryCode: "SM",
    description: "Pencatatan surat masuk beserta disposisi dan batas waktu tindak lanjut",
    signerName: "Siti Rahmawati, S.E.",
    signerPosition: "Kepala Bagian Persuratan",
    numberingFormat: DEFAULT_NUMBER_FORMAT,
    kopText: DEFAULT_KOP,
    body: [
      "Surat masuk telah diterima dan dicatat dengan rincian sebagai berikut:",
      "Asal surat: {{asal_surat}}",
      "Nomor surat: {{nomor_surat_masuk}}",
      "Tanggal surat: {{tanggal_surat_masuk}}",
      "Perihal: {{perihal_masuk}}",
      "Sifat surat: {{sifat_surat}}",
      "Disposisi pimpinan: {{isi_disposisi}}",
      "Batas waktu tindak lanjut: {{batas_waktu}}",
      "Catatan tindak lanjut: {{catatan_tindak_lanjut}}",
    ].join("\n\n"),
    fields: [
      { key: "asal_surat", label: "Asal Surat", isRequired: true },
      { key: "nomor_surat_masuk", label: "Nomor Surat Masuk", isRequired: true },
      { key: "tanggal_surat_masuk", label: "Tanggal Surat Masuk", type: "date", isRequired: true },
      { key: "perihal_masuk", label: "Perihal Surat Masuk", isRequired: true },
      { key: "sifat_surat", label: "Sifat Surat", placeholder: "Contoh: segera / penting / biasa" },
      { key: "isi_disposisi", label: "Isi Disposisi", type: "textarea", isRequired: true, placeholder: "Contoh: koordinasikan dan laporkan hasilnya" },
      { key: "batas_waktu", label: "Batas Waktu Tindak Lanjut", type: "date", isRequired: true },
      { key: "catatan_tindak_lanjut", label: "Catatan Tindak Lanjut", type: "textarea", helpText: "Opsional, dapat diisi setelah tindak lanjut dilakukan." },
    ],
  },
];

export const PRESET_CODES = TEMPLATE_PRESETS.map((preset) => preset.code);
