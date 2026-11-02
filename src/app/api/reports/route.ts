import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { letterApprovals, letterCategories, letters, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import {
  fetchApprovalTiming,
  fetchCategoryBreakdown,
  fetchMonthlySeries,
  fetchStatusCounts,
  fetchUserProductivity,
} from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("laporan.lihat") && !actor.permissions.includes("audit.lihat")) {
      return jsonOk({ error: "Anda tidak berhak melihat laporan." }, 403);
    }
    const url = new URL(request.url);
    const months = Math.min(Number(url.searchParams.get("months") ?? 12) || 12, 24);

    const [monthly, categories, productivity, timing, statusCounts] = await Promise.all([
      fetchMonthlySeries(months),
      fetchCategoryBreakdown(),
      fetchUserProductivity(),
      fetchApprovalTiming(),
      fetchStatusCounts(),
    ]);

    const overdue = await db
      .select({
        letterId: letters.id,
        title: letters.title,
        letterNumber: letters.letterNumber,
        status: letters.status,
        sender: users.name,
        stage: letterApprovals.label,
        dueAt: letterApprovals.dueAt,
        stageEnteredAt: letters.stageEnteredAt,
      })
      .from(letterApprovals)
      .innerJoin(letters, eq(letters.id, letterApprovals.letterId))
      .leftJoin(users, eq(users.id, letters.senderId))
      .where(and(eq(letterApprovals.status, "pending"), lte(letterApprovals.dueAt, new Date())))
      .orderBy(asc(letterApprovals.dueAt))
      .limit(20);

    const slowest = await db
      .select({
        id: letters.id,
        title: letters.title,
        letterNumber: letters.letterNumber,
        category: letterCategories.name,
        sender: users.name,
        hours: sql<number>`round(extract(epoch from (coalesce(${letters.approvedAt}, now()) - ${letters.submittedAt})) / 3600)`,
      })
      .from(letters)
      .leftJoin(letterCategories, eq(letterCategories.id, letters.categoryId))
      .leftJoin(users, eq(users.id, letters.senderId))
      .where(sql`${letters.submittedAt} is not null`)
      .orderBy(desc(sql`extract(epoch from (coalesce(${letters.approvedAt}, now()) - ${letters.submittedAt}))`))
      .limit(10);

    return jsonOk({
      monthly,
      categories,
      productivity,
      timing,
      statusCounts,
      overdue,
      slowest,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
