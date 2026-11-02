import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Pengelolaan berita hanya untuk Super Admin (menu "Berita & Pengumuman").
 * Sengaja memakai pemeriksaan peran, bukan izin baru, agar tidak perlu
 * mengubah data `permissions` / `role_permissions` yang sudah ada di database.
 */
const announcementSchema = z.object({
  title: z.string().trim().min(3, "Judul minimal 3 karakter.").max(160),
  body: z.string().trim().min(10, "Isi berita minimal 10 karakter.").max(4000),
  category: z.enum(["pengumuman", "berita", "pemeliharaan"]).default("pengumuman"),
  isPublished: z.boolean().default(true),
  isPinned: z.boolean().default(false),
  publishedAt: z.string().trim().optional().nullable(),
});

export async function GET() {
  try {
    await requireRole("super_admin");
    const items = await db
      .select()
      .from(announcements)
      .orderBy(desc(announcements.isPinned), desc(announcements.publishedAt), desc(announcements.id));
    return jsonOk({ items });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireRole("super_admin");
    const payload = announcementSchema.parse(await readJson(request));
    const publishedAt = payload.publishedAt ? new Date(payload.publishedAt) : new Date();

    const [row] = await db
      .insert(announcements)
      .values({
        title: payload.title,
        body: payload.body,
        category: payload.category,
        isPublished: payload.isPublished,
        isPinned: payload.isPinned,
        publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
        createdBy: actor.id,
      })
      .returning();

    await logAudit({
      actor,
      action: "tambah_berita",
      entity: "announcements",
      entityId: row.id,
      description: `Berita "${row.title}" ditambahkan`,
    });
    return jsonOk({ item: row }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
