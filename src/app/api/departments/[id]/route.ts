import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, users } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().min(2).max(10).transform((v) => v.toUpperCase()).optional(),
  name: z.string().trim().min(3).optional(),
  headName: z.string().trim().max(120).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("departemen.kelola");
    const { id } = await context.params;
    const departmentId = Number(id);
    const rows = await db.select().from(departments).where(eq(departments.id, departmentId)).limit(1);
    if (!rows[0]) return jsonOk({ error: "Departemen tidak ditemukan." }, 404);
    const payload = schema.parse(await readJson(request));
    const [updated] = await db
      .update(departments)
      .set({ ...payload, code: payload.code ?? undefined })
      .where(eq(departments.id, departmentId))
      .returning();
    await logAudit({
      actor,
      action: "ubah_departemen",
      entity: "departments",
      entityId: departmentId,
      description: `Departemen "${updated.name}" diperbarui`,
    });
    return jsonOk({ item: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("departemen.kelola");
    const { id } = await context.params;
    const departmentId = Number(id);
    const rows = await db.select().from(departments).where(eq(departments.id, departmentId)).limit(1);
    if (!rows[0]) return jsonOk({ error: "Departemen tidak ditemukan." }, 404);
    const members = await db.select({ id: users.id }).from(users).where(eq(users.departmentId, departmentId)).limit(1);
    if (members[0]) {
      await db.update(departments).set({ isActive: false }).where(eq(departments.id, departmentId));
      return jsonOk({ error: "Departemen masih memiliki anggota sehingga dinonaktifkan." }, 409);
    }
    await db.delete(departments).where(eq(departments.id, departmentId));
    await logAudit({
      actor,
      action: "hapus_departemen",
      entity: "departments",
      entityId: departmentId,
      description: `Departemen "${rows[0].name}" dihapus`,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
