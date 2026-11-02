import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk, parseIntOrNull } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("audit.lihat")) {
      return jsonOk({ error: "Anda tidak berhak melihat audit log." }, 403);
    }
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 30) || 30, 200);
    const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);
    const search = url.searchParams.get("q");
    const action = url.searchParams.get("action");
    const entity = url.searchParams.get("entity");
    const userId = parseIntOrNull(url.searchParams.get("userId"));
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    const conditions = [];
    if (search) {
      const term = `%${search}%`;
      conditions.push(or(ilike(auditLogs.description, term), ilike(auditLogs.userName, term), ilike(auditLogs.action, term)));
    }
    if (action) conditions.push(eq(auditLogs.action, action));
    if (entity) conditions.push(eq(auditLogs.entity, entity));
    if (userId) conditions.push(eq(auditLogs.userId, userId));
    if (from) conditions.push(gte(auditLogs.createdAt, new Date(`${from}T00:00:00`)));
    if (to) conditions.push(lte(auditLogs.createdAt, new Date(`${to}T23:59:59`)));
    const where = conditions.length ? and(...conditions) : undefined;

    const items = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.id)).limit(limit).offset(offset);
    const totalRows = await db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where);
    const actionRows = await db
      .select({ action: auditLogs.action, total: sql<number>`count(*)::int` })
      .from(auditLogs)
      .groupBy(auditLogs.action)
      .orderBy(desc(sql`count(*)`));

    return jsonOk({ items, total: totalRows[0]?.total ?? 0, actions: actionRows });
  } catch (error) {
    return jsonError(error);
  }
}
