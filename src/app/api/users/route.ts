import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, letters, roles, users } from "@/db/schema";
import { hashPassword, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const userSchema = z.object({
  name: z.string().trim().min(3, "Nama minimal 3 karakter."),
  email: z.string().trim().toLowerCase().email("Format email tidak valid."),
  password: z.string().min(6, "Kata sandi minimal 6 karakter."),
  roleCode: z.string().min(1, "Role wajib dipilih."),
  departmentId: z.number().int().nullable().optional(),
  position: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(30).optional().nullable(),
  nip: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    const actor = await requireUser();
    const rows = await db
      .select({
        user: users,
        role: roles,
        department: departments,
        lettersCreated: sql<number>`(select count(*)::int from ${letters} where ${letters.senderId} = ${users.id})`,
        actionsTaken: sql<number>`(select count(*)::int from ${letters} where false)`,
      })
      .from(users)
      .leftJoin(roles, eq(roles.id, users.roleId))
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .orderBy(asc(users.name));

    const detailed = actor.permissions.includes("pengguna.kelola") || actor.permissions.includes("monitoring.lihat");
    return jsonOk({
      items: rows.map((row) => ({
        id: row.user.id,
        name: row.user.name,
        email: detailed ? row.user.email : `${row.user.name.split(" ")[0]}@internal`,
        roleCode: row.role?.code ?? "",
        roleName: row.role?.name ?? "",
        roleLabel: ROLE_LABEL[row.role?.code ?? ""] ?? row.role?.name ?? "-",
        departmentId: row.user.departmentId,
        departmentName: row.department?.name ?? null,
        position: row.user.position,
        phone: row.user.phone,
        nip: detailed ? row.user.nip : null,
        isActive: row.user.isActive,
        lastLoginAt: row.user.lastLoginAt,
        createdAt: row.user.createdAt,
        lettersCreated: row.lettersCreated,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("pengguna.kelola")) {
      return jsonOk({ error: "Hanya Super Admin yang dapat menambah pengguna." }, 403);
    }
    const payload = userSchema.parse(await readJson(request));

    const roleRows = await db.select().from(roles).where(eq(roles.code, payload.roleCode)).limit(1);
    if (!roleRows[0]) return jsonOk({ error: "Role tidak dikenal." }, 400);
    const duplicate = await db.select().from(users).where(eq(users.email, payload.email)).limit(1);
    if (duplicate[0]) return jsonOk({ error: `Email "${payload.email}" sudah terdaftar.` }, 409);

    const [row] = await db
      .insert(users)
      .values({
        name: payload.name,
        email: payload.email,
        passwordHash: await hashPassword(payload.password),
        roleId: roleRows[0].id,
        departmentId: payload.departmentId ?? null,
        position: payload.position ?? null,
        phone: payload.phone ?? null,
        nip: payload.nip ?? null,
        isActive: payload.isActive,
      })
      .returning();

    await logAudit({
      actor,
      action: "tambah_pengguna",
      entity: "users",
      entityId: row.id,
      description: `Akun ${row.email} dibuat dengan role ${ROLE_LABEL[payload.roleCode]}`,
      metadata: { role: payload.roleCode },
    });
    return jsonOk({ item: { ...row, passwordHash: undefined } }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
