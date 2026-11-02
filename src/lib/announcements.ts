import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { announcements } from "@/db/schema";

export { ANNOUNCEMENT_CATEGORIES, announcementCategoryLabel, announcementCategoryTone } from "@/lib/announcement-meta";

const DEFAULT_ANNOUNCEMENTS = [
  {
    title: "Selamat datang di E-SURAT",
    body: "Sistem Informasi Manajemen Persuratan Digital resmi digunakan. Silakan masuk menggunakan akun dinas Anda untuk mulai membuat, memeriksa, dan menyetujui surat.",
    category: "pengumuman",
    isPinned: true,
  },
  {
    title: "Alur persetujuan bertingkat sudah aktif",
    body: "Setiap surat melewati pemeriksaan lalu persetujuan pejabat. Status dan riwayat tiap tahap dapat dipantau pada menu Monitoring.",
    category: "berita",
    isPinned: false,
  },
  {
    title: "Gunakan template resmi organisasi",
    body: "Template surat resmi tersedia di menu Template Surat. Penomoran surat, placeholder dinamis, dan ekspor DOCX/PDF berjalan otomatis dari template tersebut.",
    category: "berita",
    isPinned: false,
  },
];

let seedChecked = false;

/**
 * Mengisi berita bawaan satu kali bila tabel masih benar-benar kosong.
 * Dipakai oleh endpoint publik agar halaman login tidak kosong setelah instalasi baru.
 */
export async function ensureAnnouncementSeed() {
  if (seedChecked) return;
  try {
    const existing = await db.select({ id: announcements.id }).from(announcements).limit(1);
    if (existing.length === 0) {
      await db.execute(sql`
        insert into announcements (title, body, category, is_pinned)
        select ${DEFAULT_ANNOUNCEMENTS[0].title}, ${DEFAULT_ANNOUNCEMENTS[0].body}, ${DEFAULT_ANNOUNCEMENTS[0].category}, true
        where not exists (select 1 from announcements)
      `);
      for (const item of DEFAULT_ANNOUNCEMENTS.slice(1)) {
        await db.execute(sql`
          insert into announcements (title, body, category, is_pinned)
          select ${item.title}, ${item.body}, ${item.category}, ${item.isPinned}
          where not exists (select 1 from announcements where title = ${item.title})
        `);
      }
    }
    seedChecked = true;
  } catch {
    // Diamkan: halaman login tetap bisa tampil walau seeding gagal.
  }
}

export async function listPublishedAnnouncements(limit = 4) {
  return db
    .select()
    .from(announcements)
    .where(eq(announcements.isPublished, true))
    .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt))
    .limit(limit);
}

export async function listAllAnnouncements() {
  return db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt), desc(announcements.id));
}
