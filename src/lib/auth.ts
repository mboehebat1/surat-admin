import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { departments, permissions, rolePermissions, roles, users } from "@/db/schema";
import { ROLE_PERMISSIONS } from "@/lib/status";

/**
 * Hak akses dibaca dari tabel `role_permissions` (dapat dikelola Super Admin).
 * Bila tabel belum terisi, digunakan pemetaan bawaan sebagai fallback.
 */
export async function loadPermissions(roleId: number, roleCode: string): Promise<string[]> {
  const rows = await db
    .select({ code: permissions.code })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(rolePermissions.roleId, roleId));
  if (rows.length) return rows.map((row) => row.code);
  return ROLE_PERMISSIONS[roleCode] ?? [];
}

export const SESSION_COOKIE = "esurat_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

const secretKey = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "e-surat-development-secret-key-change-in-production",
);

export type SessionPayload = {
  sub: string;
  email: string;
  role: string;
  name: string;
};

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  roleCode: string;
  roleName: string;
  roleLevel: number;
  departmentId: number | null;
  departmentName: string | null;
  position: string | null;
  nip: string | null;
  signatureText: string | null;
  isActive: boolean;
  permissions: string[];
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function createSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("e-surat")
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(secretKey);
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey, { issuer: "e-surat" });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const payload = await verifySession(token);
  if (!payload?.sub) return null;

  const rows = await db
    .select({
      user: users,
      role: roles,
      department: departments,
    })
    .from(users)
    .leftJoin(roles, eq(roles.id, users.roleId))
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(eq(users.id, Number(payload.sub)))
    .limit(1);

  const row = rows[0];
  if (!row?.user || !row.user.isActive || !row.role) return null;

  return {
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
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("Sesi tidak valid. Silakan masuk kembali.", 401);
  return user;
}

export async function requireRole(...roleCodes: string[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roleCodes.includes(user.roleCode)) {
    throw new AuthError("Anda tidak memiliki hak akses untuk tindakan ini.", 403);
  }
  return user;
}

export async function requirePermission(permission: string): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.permissions.includes(permission)) {
    throw new AuthError(`Akses ditolak: membutuhkan izin "${permission}".`, 403);
  }
  return user;
}

export async function getRequestMeta() {
  try {
    const headerStore = await headers();
    return {
      ipAddress:
        headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        headerStore.get("x-real-ip") ||
        "server",
      userAgent: headerStore.get("user-agent") ?? "unknown",
    };
  } catch {
    // Dipanggil di luar konteks request (mis. proses seeding / instrumentation).
    return { ipAddress: "server", userAgent: "system" };
  }
}
