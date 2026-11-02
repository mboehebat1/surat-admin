import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { departments, letters, users } from "@/db/schema";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  code: z.string().trim().min(2).max(10).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(3, "Nama departemen minimal 3 karakter."),
  headName: z.string().trim().max(120).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET() {
  try {
    await requireUser();
    const rows = await db
      .select({
        department: departments,
        members: sql<number>`(select count(*)::int from ${users} where ${users.departmentId} = ${departments.id})`,
        letters: sql<number>`(select count(*)::int from ${letters} where ${letters.departmentId} = ${departments.id})`,
      })
      .from(departments)
      .orderBy(asc(departments.name));
    return jsonOk({
      items: rows.map((row) => ({ ...row.department, members: row.members, letters: row.letters })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("departemen.kelola");
    const payload = schema.parse(await readJson(request));
    const existing = await db.select().from(departments).where(eq(departments.code, payload.code)).limit(1);
    if (existing[0]) return jsonOk({ error: `Kode departemen "${payload.code}" sudah digunakan.` }, 409);
    const [row] = await db.insert(departments).values(payload).returning();
    await logAudit({
      actor,
      action: "tambah_departemen",
      entity: "departments",
      entityId: row.id,
      description: `Departemen "${row.name}" ditambahkan`,
    });
    return jsonOk({ item: row }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
