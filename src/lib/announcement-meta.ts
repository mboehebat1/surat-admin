/** Metadata berita yang aman dipakai di komponen klien (tanpa akses database). */
export const ANNOUNCEMENT_CATEGORIES = [
  { code: "pengumuman", label: "Pengumuman", tone: "bg-navy-50 text-navy-800 ring-navy-200" },
  { code: "berita", label: "Berita", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  { code: "pemeliharaan", label: "Pemeliharaan", tone: "bg-amber-50 text-amber-700 ring-amber-200" },
] as const;

export function announcementCategoryLabel(code: string): string {
  return ANNOUNCEMENT_CATEGORIES.find((item) => item.code === code)?.label ?? "Pengumuman";
}

export function announcementCategoryTone(code: string): string {
  return (
    ANNOUNCEMENT_CATEGORIES.find((item) => item.code === code)?.tone ??
    "bg-slate-100 text-slate-700 ring-slate-200"
  );
}
