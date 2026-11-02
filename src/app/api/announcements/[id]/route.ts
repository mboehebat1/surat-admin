import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { announcements } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  title: z.string().trim().min(3, "Judul minimal 3 karakter.").max(160).optional(),
  body: z.string().trim().min(10, "Isi berita minimal 10 karakter.").max(4000).optional(),
  category: z.enum(["pengumuman", "berita", "pemeliharaan"]).optional(),
  isPublished: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  publishedAt: z.string().trim().optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const actor = await requireRole("super_admin");
    const id = Number((await params).id);
    if (!Number.isFinite(id)) return jsonOk({ error: "ID berita tidak valid." }, 400);

    const payload = patchSchema.parse(await readJson(request));
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (payload.title !== undefined) update.title = payload.title;
    if (payload.body !== undefined) update.body = payload.body;
    if (payload.category !== undefined) update.category = payload.category;
    if (payload.isPublished !== undefined) update.isPublished = payload.isPublished;
    if (payload.isPinned !== undefined) update.isPinned = payload.isPinned;
    if (payload.publishedAt !== undefined) {
      const parsed = payload.publishedAt ? new Date(payload.publishedAt) : new Date();
      update.publishedAt = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }

    const [row] = await db.update(announcements).set(update).where(eq(announcements.id, id)).returning();
    if (!row) return jsonOk({ error: "Berita tidak ditemukan." }, 404);

    await logAudit({
      actor,
      action: "ubah_berita",
      entity: "announcements",
      entityId: row.id,
      description: `Berita "${row.title}" diperbarui`,
    });
    return jsonOk({ item: row });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const actor = await requireRole("super_admin");
    const id = Number((await params).id);
    if (!Number.isFinite(id)) return jsonOk({ error: "ID berita tidak valid." }, 400);

    const [row] = await db.delete(announcements).where(eq(announcements.id, id)).returning();
    if (!row) return jsonOk({ error: "Berita tidak ditemukan." }, 404);

    await logAudit({
      actor,
      action: "hapus_berita",
      entity: "announcements",
      entityId: row.id,
      description: `Berita "${row.title}" dihapus`,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
