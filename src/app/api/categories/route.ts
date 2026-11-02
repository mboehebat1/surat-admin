import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { letterCategories, letters } from "@/db/schema";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const categorySchema = z.object({
  code: z.string().trim().min(1).max(10).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(3, "Nama kategori minimal 3 karakter."),
  description: z.string().trim().max(500).optional().nullable(),
  direction: z.enum(["masuk", "keluar", "internal"]).default("keluar"),
  defaultNumberFormat: z.string().trim().max(120).optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireUser();
    const rows = await db
      .select({
        category: letterCategories,
        total: sql<number>`count(${letters.id})::int`,
      })
      .from(letterCategories)
      .leftJoin(letters, eq(letters.categoryId, letterCategories.id))
      .groupBy(letterCategories.id)
      .orderBy(asc(letterCategories.name));
    return jsonOk({ items: rows.map((r) => ({ ...r.category, letterCount: r.total })) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("template.kelola");
    const payload = categorySchema.parse(await readJson(request));
    const existing = await db.select().from(letterCategories).where(eq(letterCategories.code, payload.code)).limit(1);
    if (existing[0]) return jsonOk({ error: `Kode kategori "${payload.code}" sudah digunakan.` }, 409);

    const [row] = await db.insert(letterCategories).values(payload).returning();
    await logAudit({
      actor,
      action: "tambah_kategori",
      entity: "letter_categories",
      entityId: row.id,
      description: `Kategori surat "${row.name}" ditambahkan`,
    });
    return jsonOk({ item: row }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
