import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { letterCategories, letters } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .transform((v) => v.toUpperCase())
    .optional(),
  name: z.string().trim().min(3, "Nama kategori minimal 3 karakter.").optional(),
  description: z.string().trim().max(500).nullable().optional(),
  direction: z.enum(["masuk", "keluar", "internal"]).optional(),
  defaultNumberFormat: z.string().trim().max(120).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** Ubah kategori surat — sebelumnya hanya tersedia tambah, sehingga salah ketik tidak bisa diperbaiki. */
export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requirePermission("template.kelola");
    const { id } = await context.params;
    const categoryId = Number(id);
    if (!Number.isFinite(categoryId)) return jsonOk({ error: "ID kategori tidak valid." }, 400);

    const rows = await db.select().from(letterCategories).where(eq(letterCategories.id, categoryId)).limit(1);
    const current = rows[0];
    if (!current) return jsonOk({ error: "Kategori tidak ditemukan." }, 404);

    const payload = updateSchema.parse(await readJson(request));
    if (payload.code && payload.code !== current.code) {
      const duplicate = await db
        .select({ id: letterCategories.id })
        .from(letterCategories)
        .where(eq(letterCategories.code, payload.code))
        .limit(1);
      if (duplicate[0]) return jsonOk({ error: `Kode kategori "${payload.code}" sudah digunakan.` }, 409);
    }

    const [updated] = await db
      .update(letterCategories)
      .set({ ...payload })
      .where(eq(letterCategories.id, categoryId))
      .returning();

    await logAudit({
      actor,
      action: "ubah_kategori",
      entity: "letter_categories",
      entityId: categoryId,
      description: `Kategori surat "${current.name}" diperbarui (${Object.keys(payload).join(", ") || "tanpa perubahan"})`,
      metadata: { before: current, after: updated },
    });
    return jsonOk({ item: updated });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Hapus kategori. Kategori yang sudah dipakai surat ditolak agar riwayat surat
 * tidak kehilangan kategorinya (kolom letter.category_id akan dikosongkan FK).
 */
export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requirePermission("template.kelola");
    const { id } = await context.params;
    const categoryId = Number(id);
    if (!Number.isFinite(categoryId)) return jsonOk({ error: "ID kategori tidak valid." }, 400);

    const rows = await db.select().from(letterCategories).where(eq(letterCategories.id, categoryId)).limit(1);
    const current = rows[0];
    if (!current) return jsonOk({ error: "Kategori tidak ditemukan." }, 404);

    const usage = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(letters)
      .where(eq(letters.categoryId, categoryId));
    if ((usage[0]?.total ?? 0) > 0) {
      return jsonOk(
        {
          error: `Kategori "${current.name}" sudah dipakai ${usage[0].total} surat. Nonaktifkan saja agar riwayat surat tetap utuh.`,
        },
        400,
      );
    }

    await db.delete(letterCategories).where(eq(letterCategories.id, categoryId));
    await logAudit({
      actor,
      action: "hapus_kategori",
      entity: "letter_categories",
      entityId: categoryId,
      description: `Kategori surat "${current.name}" dihapus`,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
