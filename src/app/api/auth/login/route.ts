import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, roles, users } from "@/db/schema";
import { clearSessionCookie, createSession, loadPermissions, setSessionCookie, verifyPassword, type SessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3, "Email wajib diisi."),
  password: z.string().min(6, "Kata sandi minimal 6 karakter."),
});

export async function POST(request: Request) {
  try {
    const payload = loginSchema.parse(await readJson(request));
    const rows = await db
      .select({ user: users, role: roles, department: departments })
      .from(users)
      .leftJoin(roles, eq(roles.id, users.roleId))
      .leftJoin(departments, eq(departments.id, users.departmentId))
      .where(eq(users.email, payload.email))
      .limit(1);

    const row = rows[0];
    if (!row?.user || !row.role) {
      return jsonOk({ error: "Email atau kata sandi salah." }, 401);
    }

    const valid = await verifyPassword(payload.password, row.user.passwordHash);
    if (!valid) {
      await logAudit({
        actor: null,
        action: "login_gagal",
        entity: "users",
        entityId: row.user.id,
        description: `Percobaan masuk gagal untuk ${payload.email}`,
      });
      return jsonOk({ error: "Email atau kata sandi salah." }, 401);
    }
    if (!row.user.isActive) {
      return jsonOk({ error: "Akun Anda dinonaktifkan. Hubungi Super Admin." }, 403);
    }

    const token = await createSession({
      sub: String(row.user.id),
      email: row.user.email,
      role: row.role.code,
      name: row.user.name,
    });
    await clearSessionCookie().catch(() => undefined);
    await setSessionCookie(token);
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.user.id));

    const session: SessionUser = {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      roleCode: row.role.code,
      roleName: row.role.name,
      roleLevel: row.role.level,
      departmentId: row.department?.id ?? null,
      departmentName: row.department?.name ?? null,
      position: row.user.position,
      nip: row.user.nip,
      signatureText: row.user.signatureText,
      isActive: row.user.isActive,
      permissions: await loadPermissions(row.role.id, row.role.code),
    };

    await logAudit({
      actor: session,
      action: "login",
      entity: "users",
      entityId: session.id,
      description: `${session.name} berhasil masuk ke sistem`,
      metadata: { role: session.roleCode },
    });

    return jsonOk({ user: session });
  } catch (error) {
    return jsonError(error);
  }
}


