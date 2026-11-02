import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  approvalWorkflows,
  auditLogs,
  departments,
  letterApprovals,
  letterArchives,
  letterAttachments,
  letterCategories,
  letterRevisions,
  letterTemplates,
  letters,
  templateFields,
  users,
  type Letter,
} from "@/db/schema";
import { ROLE_LABEL, STATUS_META, type LetterStatus } from "@/lib/status";

export type LetterRow = Letter & {
  categoryName: string | null;
  categoryCode: string | null;
  templateName: string | null;
  senderName: string | null;
  senderEmail: string | null;
  departmentName: string | null;
  statusLabel: string;
  currentStepLabel: string | null;
  currentApproverRole: string | null;
  currentApproverRoleLabel: string | null;
  stageDurationMs: number;
  archived: boolean;
};

export type LetterFilters = {
  search?: string;
  status?: string[];
  categoryId?: number | null;
  departmentId?: number | null;
  senderId?: number | null;
  approverRole?: string | null;
  from?: string | null;
  to?: string | null;
  scope?: "all" | "mine" | "pending" | "archive";
  actorId?: number | null;
  actorRole?: string | null;
  limit?: number;
  offset?: number;
  sort?: "newest" | "oldest" | "number";
};

function decorate(
  letter: Letter,
  extras: {
    categoryName?: string | null;
    categoryCode?: string | null;
    templateName?: string | null;
    senderName?: string | null;
    senderEmail?: string | null;
    departmentName?: string | null;
    pending?: { label: string; roleCode: string } | null;
    archived?: boolean;
  },
): LetterRow {
  const meta = STATUS_META[letter.status as LetterStatus] ?? STATUS_META.draft;
  const stageEntered = letter.stageEnteredAt ?? letter.updatedAt ?? new Date();
  return {
    ...letter,
    categoryName: extras.categoryName ?? null,
    categoryCode: extras.categoryCode ?? null,
    templateName: extras.templateName ?? null,
    senderName: extras.senderName ?? null,
    senderEmail: extras.senderEmail ?? null,
    departmentName: extras.departmentName ?? null,
    statusLabel: meta.label,
    currentStepLabel: extras.pending?.label ?? null,
    currentApproverRole: extras.pending?.roleCode ?? null,
    currentApproverRoleLabel: extras.pending ? ROLE_LABEL[extras.pending.roleCode] ?? extras.pending.roleCode : null,
    stageDurationMs: Date.now() - new Date(stageEntered).getTime(),
    archived: extras.archived ?? false,
  };
}

export async function fetchLetters(filters: LetterFilters = {}): Promise<{ rows: LetterRow[]; total: number }> {
  const conditions = [];
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(letters.title, term),
        ilike(letters.letterNumber, term),
        ilike(letters.recipientName, term),
      ),
    );
  }
  if (filters.status?.length) conditions.push(inArray(letters.status, filters.status));
  if (filters.categoryId) conditions.push(eq(letters.categoryId, filters.categoryId));
  if (filters.departmentId) conditions.push(eq(letters.departmentId, filters.departmentId));
  if (filters.senderId) conditions.push(eq(letters.senderId, filters.senderId));
  if (filters.from) conditions.push(gte(letters.createdAt, new Date(`${filters.from}T00:00:00`)));
  if (filters.to) conditions.push(lte(letters.createdAt, new Date(`${filters.to}T23:59:59`)));
  if (filters.scope === "mine" && filters.actorId) conditions.push(eq(letters.senderId, filters.actorId));
  if (filters.scope === "archive") {
    conditions.push(inArray(letters.status, ["disetujui", "selesai", "diarsipkan"]));
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const order =
    filters.sort === "oldest"
      ? asc(letters.createdAt)
      : filters.sort === "number"
        ? asc(letters.letterNumber)
        : desc(letters.createdAt);

  const baseRows = await db
    .select({
      letter: letters,
      category: letterCategories,
      template: letterTemplates,
      sender: users,
      department: departments,
    })
    .from(letters)
    .leftJoin(letterCategories, eq(letterCategories.id, letters.categoryId))
    .leftJoin(letterTemplates, eq(letterTemplates.id, letters.templateId))
    .leftJoin(users, eq(users.id, letters.senderId))
    .leftJoin(departments, eq(departments.id, letters.departmentId))
    .where(where)
    .orderBy(order);

  let rows = baseRows;

  if (filters.scope === "pending" && filters.actorRole) {
    const pendingRows = await db
      .select({ letterId: letterApprovals.letterId })
      .from(letterApprovals)
      .where(
        and(
          eq(letterApprovals.status, "pending"),
          filters.actorRole === "super_admin"
            ? isNotNull(letterApprovals.id)
            : eq(letterApprovals.roleCode, filters.actorRole),
        ),
      );
    const ids = new Set(pendingRows.map((r) => r.letterId));
    rows = rows.filter((r) => ids.has(r.letter.id));
  }

  if (filters.approverRole) {
    const approverRows = await db
      .select({ letterId: letterApprovals.letterId })
      .from(letterApprovals)
      .where(and(eq(letterApprovals.roleCode, filters.approverRole), eq(letterApprovals.status, "pending")));
    const ids = new Set(approverRows.map((r) => r.letterId));
    rows = rows.filter((r) => ids.has(r.letter.id));
  }

  const total = rows.length;
  const limit = filters.limit ?? 25;
  const offset = filters.offset ?? 0;
  const page = rows.slice(offset, offset + limit);

  const pendingApprovals = page.length
    ? await db
        .select()
        .from(letterApprovals)
        .where(
          and(
            inArray(
              letterApprovals.letterId,
              page.map((r) => r.letter.id),
            ),
            eq(letterApprovals.status, "pending"),
          ),
        )
    : [];
  const archiveRows = page.length
    ? await db
        .select({ letterId: letterArchives.letterId })
        .from(letterArchives)
        .where(
          inArray(
            letterArchives.letterId,
            page.map((r) => r.letter.id),
          ),
        )
    : [];
  const archiveSet = new Set(archiveRows.map((r) => r.letterId));

  const decorated = page.map((row) => {
    const pending = pendingApprovals.find(
      (a) => a.letterId === row.letter.id && a.cycle === row.letter.cycle,
    );
    return decorate(row.letter, {
      categoryName: row.category?.name,
      categoryCode: row.category?.code,
      templateName: row.template?.name,
      senderName: row.sender?.name,
      senderEmail: row.sender?.email,
      departmentName: row.department?.name,
      pending: pending ? { label: pending.label, roleCode: pending.roleCode } : null,
      archived: archiveSet.has(row.letter.id),
    });
  });

  return { rows: decorated, total };
}

export async function fetchLetterDetail(letterId: number) {
  const rows = await db
    .select({
      letter: letters,
      category: letterCategories,
      template: letterTemplates,
      sender: users,
      department: departments,
    })
    .from(letters)
    .leftJoin(letterCategories, eq(letterCategories.id, letters.categoryId))
    .leftJoin(letterTemplates, eq(letterTemplates.id, letters.templateId))
    .leftJoin(users, eq(users.id, letters.senderId))
    .leftJoin(departments, eq(departments.id, letters.departmentId))
    .where(eq(letters.id, letterId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [attachments, approvals, revisions, archive, fields, history] = await Promise.all([
    db.select().from(letterAttachments).where(eq(letterAttachments.letterId, letterId)).orderBy(asc(letterAttachments.id)),
    db
      .select({
        approval: letterApprovals,
        approver: users,
      })
      .from(letterApprovals)
      .leftJoin(users, eq(users.id, letterApprovals.approverId))
      .where(eq(letterApprovals.letterId, letterId))
      .orderBy(asc(letterApprovals.cycle), asc(letterApprovals.stepOrder)),
    db
      .select({ revision: letterRevisions, requester: users })
      .from(letterRevisions)
      .leftJoin(users, eq(users.id, letterRevisions.requestedBy))
      .where(eq(letterRevisions.letterId, letterId))
      .orderBy(desc(letterRevisions.id)),
    db.select().from(letterArchives).where(eq(letterArchives.letterId, letterId)).limit(1),
    row.template
      ? db.select().from(templateFields).where(eq(templateFields.templateId, row.template.id)).orderBy(asc(templateFields.sortOrder))
      : Promise.resolve([]),
    db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, String(letterId)))
      .orderBy(desc(auditLogs.id))
      .limit(40),
  ]);

  const workflowRows = row.letter.workflowId
    ? await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, row.letter.workflowId)).limit(1)
    : [];

  const pending = approvals.find(
    (a) => a.approval.status === "pending" && a.approval.cycle === row.letter.cycle,
  );

  return {
    letter: decorate(row.letter, {
      categoryName: row.category?.name,
      categoryCode: row.category?.code,
      templateName: row.template?.name,
      senderName: row.sender?.name,
      senderEmail: row.sender?.email,
      departmentName: row.department?.name,
      pending: pending ? { label: pending.approval.label, roleCode: pending.approval.roleCode } : null,
      archived: Boolean(archive[0]),
    }),
    category: row.category,
    template: row.template,
    sender: row.sender,
    department: row.department,
    attachments,
    approvals: approvals.map((a) => ({
      ...a.approval,
      approverName: a.approver?.name ?? null,
      approverRoleLabel: ROLE_LABEL[a.approval.roleCode] ?? a.approval.roleCode,
    })),
    revisions: revisions.map((r) => ({ ...r.revision, requesterName: r.requester?.name ?? null })),
    archive: archive[0] ?? null,
    fields,
    history: history.filter((h) => h.entity === "letters"),
    workflow: workflowRows[0] ?? null,
  };
}

export type LetterDetail = NonNullable<Awaited<ReturnType<typeof fetchLetterDetail>>>;

export async function fetchStatusCounts(actorId?: number) {
  const rows = await db
    .select({ status: letters.status, total: sql<number>`count(*)::int` })
    .from(letters)
    .groupBy(letters.status);
  const counts: Record<string, number> = {};
  for (const status of Object.keys(STATUS_META)) counts[status] = 0;
  rows.forEach((r) => (counts[r.status] = r.total));

  const mineRows = actorId
    ? await db
        .select({ total: sql<number>`count(*)::int` })
        .from(letters)
        .where(eq(letters.senderId, actorId))
    : [];

  return { counts, total: rows.reduce((sum, r) => sum + r.total, 0), mine: mineRows[0]?.total ?? 0 };
}

export async function fetchMonthlySeries(months = 12) {
  const rows = await db
    .select({
      month: sql<string>`to_char(${letters.createdAt}, 'YYYY-MM')`,
      total: sql<number>`count(*)::int`,
      masuk: sql<number>`count(*) filter (where ${letterCategories.direction} = 'masuk')::int`,
      keluar: sql<number>`count(*) filter (where ${letterCategories.direction} <> 'masuk')::int`,
      disetujui: sql<number>`count(*) filter (where ${letters.status} in ('disetujui','selesai','diarsipkan'))::int`,
      ditolak: sql<number>`count(*) filter (where ${letters.status} = 'ditolak')::int`,
    })
    .from(letters)
    .leftJoin(letterCategories, eq(letterCategories.id, letters.categoryId))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const series: { key: string; label: string; total: number; masuk: number; keluar: number; disetujui: number; ditolak: number }[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const found = rows.find((r) => r.month === key);
    series.push({
      key,
      label: date.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
      total: found?.total ?? 0,
      masuk: found?.masuk ?? 0,
      keluar: found?.keluar ?? 0,
      disetujui: found?.disetujui ?? 0,
      ditolak: found?.ditolak ?? 0,
    });
  }
  return series;
}

export async function fetchCategoryBreakdown() {
  return db
    .select({
      name: letterCategories.name,
      code: letterCategories.code,
      total: sql<number>`count(${letters.id})::int`,
    })
    .from(letterCategories)
    .leftJoin(letters, eq(letters.categoryId, letterCategories.id))
    .groupBy(letterCategories.id, letterCategories.name, letterCategories.code)
    .orderBy(desc(sql`count(${letters.id})`));
}

export async function fetchUserProductivity() {
  return db
    .select({
      name: users.name,
      department: departments.name,
      dibuat: sql<number>`count(${letters.id}) filter (where ${letters.senderId} = ${users.id})::int`,
      disetujui: sql<number>`count(${letters.id}) filter (where ${letters.status} in ('disetujui','selesai','diarsipkan'))::int`,
    })
    .from(users)
    .leftJoin(letters, eq(letters.senderId, users.id))
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .groupBy(users.id, users.name, departments.name)
    .orderBy(desc(sql`count(${letters.id})`))
    .limit(10);
}

export async function fetchApprovalTiming() {
  const rows = await db
    .select({
      avgHours: sql<number | null>`avg(extract(epoch from (${letters.approvedAt} - ${letters.submittedAt})) / 3600)`,
      approved: sql<number>`count(*)::int`,
      rejected: sql<number>`count(*) filter (where ${letters.status} = 'ditolak')::int`,
      revised: sql<number>`coalesce(sum(${letters.revisionCount}), 0)::int`,
      late: sql<number>`count(*) filter (where ${letters.approvedAt} - ${letters.submittedAt} > interval '3 days')::int`,
    })
    .from(letters);
  const overdueRows = await db
    .select({ overdue: sql<number>`count(*)::int` })
    .from(letterApprovals)
    .where(and(eq(letterApprovals.status, "pending"), lte(letterApprovals.dueAt, new Date())));
  const revisedRows = await db
    .select({ revised: sql<number>`count(*)::int` })
    .from(letters)
    .where(sql`${letters.revisionCount} > 0`);
  return {
    avgHours: Number(rows[0]?.avgHours ?? 0),
    approved: rows[0]?.approved ?? 0,
    rejected: rows[0]?.rejected ?? 0,
    revised: revisedRows[0]?.revised ?? 0,
    late: rows[0]?.late ?? 0,
    overduePending: overdueRows[0]?.overdue ?? 0,
  };
}

export async function fetchRecentActivities(limit = 12) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(limit);
}

export async function fetchStageDurations(letterId: number) {
  const rows = await db
    .select({ approval: letterApprovals, approver: users })
    .from(letterApprovals)
    .leftJoin(users, eq(users.id, letterApprovals.approverId))
    .where(eq(letterApprovals.letterId, letterId))
    .orderBy(asc(letterApprovals.cycle), asc(letterApprovals.stepOrder));
  return rows.map((row, index, all) => {
    const prev = all[index - 1]?.approval;
    const start = row.approval.createdAt ?? prev?.actedAt ?? new Date();
    const end = row.approval.actedAt ?? new Date();
    return {
      ...row.approval,
      approverName: row.approver?.name ?? null,
      roleLabel: ROLE_LABEL[row.approval.roleCode] ?? row.approval.roleCode,
      durationMs: Math.max(0, new Date(end).getTime() - new Date(start).getTime()),
    };
  });
}
