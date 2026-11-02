export const ROLE = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin_persuratan",
  USER: "pembuat_surat",
  REVIEWER: "pemeriksa",
  APPROVER: "pejabat",
} as const;

export type RoleCode = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin_persuratan: "Admin Persuratan",
  pembuat_surat: "Pembuat Surat",
  pemeriksa: "Pemeriksa / Reviewer",
  pejabat: "Pejabat Penyetuju",
};

export const ROLE_LEVEL: Record<string, number> = {
  super_admin: 5,
  admin_persuratan: 4,
  pejabat: 3,
  pemeriksa: 2,
  pembuat_surat: 1,
};

export const PERMISSIONS = [
  { code: "dashboard.lihat", name: "Melihat dashboard", module: "Dashboard" },
  { code: "surat.lihat", name: "Melihat surat", module: "Surat" },
  { code: "surat.buat", name: "Membuat surat", module: "Surat" },
  { code: "surat.edit", name: "Mengubah surat", module: "Surat" },
  { code: "surat.hapus", name: "Menghapus surat", module: "Surat" },
  { code: "surat.kirim", name: "Mengajukan surat", module: "Surat" },
  { code: "surat.periksa", name: "Memeriksa surat", module: "Surat" },
  { code: "surat.setujui", name: "Menyetujui surat", module: "Surat" },
  { code: "surat.tolak", name: "Menolak surat", module: "Surat" },
  { code: "surat.revisi", name: "Meminta revisi surat", module: "Surat" },
  { code: "surat.distribusi", name: "Mendistribusikan surat", module: "Surat" },
  { code: "surat.arsip", name: "Mengelola arsip surat", module: "Arsip" },
  { code: "nomor.kelola", name: "Mengatur nomor surat", module: "Surat" },
  { code: "template.lihat", name: "Melihat template surat", module: "Template" },
  { code: "template.kelola", name: "Mengelola template surat", module: "Template" },
  { code: "monitoring.lihat", name: "Melihat monitoring persuratan", module: "Monitoring" },
  { code: "laporan.lihat", name: "Melihat laporan dan statistik", module: "Laporan" },
  { code: "audit.lihat", name: "Melihat audit log", module: "Audit" },
  { code: "pengguna.kelola", name: "Mengelola pengguna", module: "Administrasi" },
  { code: "departemen.kelola", name: "Mengelola departemen", module: "Administrasi" },
  { code: "alur.kelola", name: "Mengatur alur persetujuan", module: "Administrasi" },
] as const;

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: PERMISSIONS.map((p) => p.code),
  admin_persuratan: [
    "dashboard.lihat",
    "surat.lihat",
    "surat.buat",
    "surat.edit",
    "surat.hapus",
    "surat.kirim",
    "surat.periksa",
    "surat.revisi",
    "surat.distribusi",
    "surat.arsip",
    "nomor.kelola",
    "template.lihat",
    "template.kelola",
    "monitoring.lihat",
    "laporan.lihat",
    "audit.lihat",
    "departemen.kelola",
  ],
  pembuat_surat: ["dashboard.lihat", "surat.lihat", "surat.buat", "surat.edit", "surat.kirim"],
  pemeriksa: [
    "dashboard.lihat",
    "surat.lihat",
    "surat.periksa",
    "surat.revisi",
    "monitoring.lihat",
    "template.lihat",
  ],
  pejabat: [
    "dashboard.lihat",
    "surat.lihat",
    "surat.setujui",
    "surat.tolak",
    "surat.revisi",
    "monitoring.lihat",
    "laporan.lihat",
    "template.lihat",
  ],
};

export const LETTER_STATUS = [
  "draft",
  "diajukan",
  "menunggu_pemeriksaan",
  "dalam_pemeriksaan",
  "revisi",
  "menunggu_persetujuan",
  "disetujui",
  "ditolak",
  "selesai",
  "diarsipkan",
] as const;

export type LetterStatus = (typeof LETTER_STATUS)[number];

type StatusMeta = {
  label: string;
  badge: string;
  dot: string;
  text: string;
  group: "gray" | "blue" | "yellow" | "red" | "green";
};

export const STATUS_META: Record<LetterStatus, StatusMeta> = {
  draft: {
    label: "Draft",
    badge: "bg-slate-100 text-slate-700 ring-slate-300",
    dot: "bg-slate-400",
    text: "text-slate-600",
    group: "gray",
  },
  diajukan: {
    label: "Diajukan",
    badge: "bg-blue-50 text-blue-700 ring-blue-300",
    dot: "bg-blue-500",
    text: "text-blue-600",
    group: "blue",
  },
  menunggu_pemeriksaan: {
    label: "Menunggu Pemeriksaan",
    badge: "bg-amber-50 text-amber-700 ring-amber-300",
    dot: "bg-amber-500",
    text: "text-amber-600",
    group: "yellow",
  },
  dalam_pemeriksaan: {
    label: "Dalam Pemeriksaan",
    badge: "bg-blue-50 text-blue-700 ring-blue-300",
    dot: "bg-blue-500",
    text: "text-blue-600",
    group: "blue",
  },
  revisi: {
    label: "Revisi",
    badge: "bg-red-50 text-red-700 ring-red-300",
    dot: "bg-red-500",
    text: "text-red-600",
    group: "red",
  },
  menunggu_persetujuan: {
    label: "Menunggu Persetujuan",
    badge: "bg-amber-50 text-amber-700 ring-amber-300",
    dot: "bg-amber-500",
    text: "text-amber-600",
    group: "yellow",
  },
  disetujui: {
    label: "Disetujui",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-300",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    group: "green",
  },
  ditolak: {
    label: "Ditolak",
    badge: "bg-red-50 text-red-700 ring-red-300",
    dot: "bg-red-500",
    text: "text-red-600",
    group: "red",
  },
  selesai: {
    label: "Selesai",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-300",
    dot: "bg-emerald-500",
    text: "text-emerald-600",
    group: "green",
  },
  diarsipkan: {
    label: "Diarsipkan",
    badge: "bg-emerald-100 text-emerald-800 ring-emerald-400",
    dot: "bg-emerald-600",
    text: "text-emerald-700",
    group: "green",
  },
};

export const ACTION_META: Record<string, { label: string; badge: string }> = {
  approved: { label: "Disetujui", badge: "bg-emerald-50 text-emerald-700 ring-emerald-300" },
  rejected: { label: "Ditolak", badge: "bg-red-50 text-red-700 ring-red-300" },
  revision: { label: "Revisi", badge: "bg-amber-50 text-amber-700 ring-amber-300" },
  pending: { label: "Menunggu", badge: "bg-yellow-50 text-yellow-700 ring-yellow-300" },
  waiting: { label: "Belum Giliran", badge: "bg-slate-100 text-slate-600 ring-slate-300" },
};

export const FIELD_TYPES = ["text", "textarea", "date", "number", "select", "email"] as const;

export const FIELD_TYPE_LABEL: Record<string, string> = {
  text: "Teks singkat",
  textarea: "Teks panjang",
  date: "Tanggal",
  number: "Angka",
  select: "Pilihan",
  email: "Email",
};

export const ROMAN_MONTHS = [
  "I",
  "II",
  "III",
  "IV",
  "V",
  "VI",
  "VII",
  "VIII",
  "IX",
  "X",
  "XI",
  "XII",
];

export const INDONESIAN_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

export function formatDateID(value?: string | Date | null): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value.length <= 10 ? `${value}T00:00:00` : value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return `${date.getDate()} ${INDONESIAN_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTimeID(value?: string | Date | null): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${date.getDate()} ${INDONESIAN_MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hh}:${mm}`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function durationLabel(ms: number): string {
  if (ms < 0) ms = 0;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes} menit`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam ${minutes % 60} menit`;
  const days = Math.floor(hours / 24);
  return `${days} hari ${hours % 24} jam`;
}

export function titleCaseKey(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
