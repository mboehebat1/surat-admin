import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, notifications, roles, users } from "@/db/schema";
import { getRequestMeta, type SessionUser } from "@/lib/auth";

export async function logAudit(input: {
  actor: SessionUser | null;
  action: string;
  entity?: string;
  entityId?: string | number | null;
  description?: string;
  metadata?: Record<string, unknown>;
}) {
  const meta = await getRequestMeta();
  await db.insert(auditLogs).values({
    userId: input.actor?.id ?? null,
    userName: input.actor?.name ?? "Sistem",
    userEmail: input.actor?.email ?? "system@esurat.local",
    action: input.action,
    entity: input.entity ?? null,
    entityId: input.entityId != null ? String(input.entityId) : null,
    description: input.description ?? null,
    metadata: input.metadata ?? {},
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}

export type NotificationInput = {
  userIds?: number[];
  roleCodes?: string[];
  departmentId?: number | null;
  type?: string;
  title: string;
  message: string;
  letterId?: number | null;
  link?: string | null;
};

export async function notify(input: NotificationInput) {
  let targetIds = new Set<number>(input.userIds ?? []);

  if (input.roleCodes?.length) {
    const roleRows = await db
      .select({ id: roles.id })
      .from(roles)
      .where(inArray(roles.code, input.roleCodes));
    const roleIds = roleRows.map((r) => r.id);
    if (roleIds.length) {
      const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(
          input.departmentId
            ? and(inArray(users.roleId, roleIds), eq(users.departmentId, input.departmentId), eq(users.isActive, true))
            : and(inArray(users.roleId, roleIds), eq(users.isActive, true)),
        );
      userRows.forEach((u) => targetIds.add(u.id));
    }
  }

  if (targetIds.size === 0) return 0;

  await db.insert(notifications).values(
    Array.from(targetIds).map((userId) => ({
      userId,
      letterId: input.letterId ?? null,
      type: input.type ?? "info",
      title: input.title,
      message: input.message,
      link: input.link ?? null,
    })),
  );
  return targetIds.size;
}
