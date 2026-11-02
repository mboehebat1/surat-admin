import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 20) || 20, 100);

    const items = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, actor.id))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
    const unreadRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, actor.id), eq(notifications.isRead, false)));

    return jsonOk({ items, unread: unreadRows[0]?.total ?? 0 });
  } catch (error) {
    return jsonError(error);
  }
}
