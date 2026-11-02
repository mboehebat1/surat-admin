import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { letters, roles, users } from "@/db/schema";
import { hashPassword, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(3).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  password: z.string().min(6).optional().nullable(),
  roleCode: z.string().min(1).optional(),
  departmentId: z.number().int().nullable().optional(),
  position: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  nip: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
});

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const userId = Number(id);
    const isSelf = actor.id === userId;
    if (!isSelf && !actor.permissions.includes("pengguna.kelola")) {
      return jsonOk({ error: "Anda tidak berhak mengubah data pengguna ini." }, 403);
    }

    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const target = rows[0];
    if (!target) return jsonOk({ error: "Pengguna tidak ditemukan." }, 404);

    const payload = updateSchema.parse(await readJson(request));
    const update: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };

    if (payload.name !== undefined) update.name = payload.name;
    if (payload.email !== undefined) update.email = payload.email;
    if (payload.position !== undefined) update.position = payload.position;
    if (payload.phone !== undefined) update.phone = payload.phone;
    if (payload.departmentId !== undefined) update.departmentId = payload.departmentId;
    if (payload.password) update.passwordHash = await hashPassword(payload.password);
    if (!isSelf) {
      if (payload.nip !== undefined) update.nip = payload.nip;
      if (payload.isActive !== undefined) update.isActive = payload.isActive;
      if (payload.roleCode) {
        const roleRows = await db.select().from(roles).where(eq(roles.code, payload.roleCode)).limit(1);
        if (!roleRows[0]) return jsonOk({ error: "Role tidak dikenal." }, 400);
        update.roleId = roleRows[0].id;
      }
    }

    const [updated] = await db.update(users).set(update).where(eq(users.id, userId)).returning();
    await logAudit({
      actor,
      action: update.roleId ? "ubah_hak_akses" : "ubah_pengguna",
      entity: "users",
      entityId: userId,
      description: `Data pengguna ${updated.email} diperbarui (${Object.keys(update).join(", ")})`,
      metadata: { changes: Object.keys(update), role: payload.roleCode ?? null },
    });
    return jsonOk({ item: { ...updated, passwordHash: undefined } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("pengguna.kelola")) {
      return jsonOk({ error: "Hanya Super Admin yang dapat menghapus pengguna." }, 403);
    }
    const { id } = await context.params;
    const userId = Number(id);
    if (userId === actor.id) return jsonOk({ error: "Anda tidak dapat menghapus akun sendiri." }, 400);

    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!rows[0]) return jsonOk({ error: "Pengguna tidak ditemukan." }, 404);

    const related = await db.select({ id: letters.id }).from(letters).where(eq(letters.senderId, userId)).limit(1);
    if (related[0]) {
      await db.update(users).set({ isActive: false, updatedAt: new Date() }).where(eq(users.id, userId));
      await logAudit({
        actor,
        action: "nonaktifkan_pengguna",
        entity: "users",
        entityId: userId,
        description: `Akun ${rows[0].email} dinonaktifkan (memiliki riwayat surat)`,
      });
      return jsonOk({ error: "Pengguna memiliki riwayat surat sehingga dinonaktifkan, bukan dihapus." }, 200);
    }

    await db.delete(users).where(eq(users.id, userId));
    await logAudit({
      actor,
      action: "hapus_pengguna",
      entity: "users",
      entityId: userId,
      description: `Akun ${rows[0].email} dihapus`,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
