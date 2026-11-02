import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { approvalSteps, approvalWorkflows, letters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().trim().min(4).optional(),
  description: z.string().trim().max(400).nullable().optional(),
  categoryId: z.number().int().nullable().optional(),
  departmentId: z.number().int().nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  steps: z
    .array(
      z.object({
        label: z.string().trim().min(3),
        roleCode: z.string().min(1),
        slaHours: z.number().int().min(1).max(720).default(24),
        description: z.string().trim().max(300).nullable().optional(),
      }),
    )
    .min(1)
    .max(8)
    .optional(),
});

type Context = { params: Promise<{ id: string }> };

async function load(id: number) {
  const rows = await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    const workflow = await load(Number(id));
    if (!workflow) return jsonOk({ error: "Alur tidak ditemukan." }, 404);
    const steps = await db
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.workflowId, workflow.id))
      .orderBy(asc(approvalSteps.stepOrder));
    return jsonOk({ item: { ...workflow, steps } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("alur.kelola")) {
      return jsonOk({ error: "Hanya Super Admin yang dapat mengubah alur persetujuan." }, 403);
    }
    const { id } = await context.params;
    const workflowId = Number(id);
    const workflow = await load(workflowId);
    if (!workflow) return jsonOk({ error: "Alur tidak ditemukan." }, 404);

    const payload = schema.parse(await readJson(request));
    if (payload.isDefault) await db.update(approvalWorkflows).set({ isDefault: false });

    const update: Partial<typeof approvalWorkflows.$inferInsert> = { updatedAt: new Date() };
    if (payload.name !== undefined) update.name = payload.name;
    if (payload.description !== undefined) update.description = payload.description;
    if (payload.categoryId !== undefined) update.categoryId = payload.categoryId;
    if (payload.departmentId !== undefined) update.departmentId = payload.departmentId;
    if (payload.isDefault !== undefined) update.isDefault = payload.isDefault;
    if (payload.isActive !== undefined) update.isActive = payload.isActive;
    const [updated] = await db
      .update(approvalWorkflows)
      .set(update)
      .where(eq(approvalWorkflows.id, workflowId))
      .returning();

    if (payload.steps) {
      await db.delete(approvalSteps).where(eq(approvalSteps.workflowId, workflowId));
      await db.insert(approvalSteps).values(
        payload.steps.map((step, index) => ({
          workflowId,
          stepOrder: index + 1,
          label: step.label,
          roleCode: step.roleCode,
          slaHours: step.slaHours,
          description: step.description ?? null,
          isRequired: true,
        })),
      );
    }

    const steps = await db
      .select()
      .from(approvalSteps)
      .where(eq(approvalSteps.workflowId, workflowId))
      .orderBy(asc(approvalSteps.stepOrder));

    await logAudit({
      actor,
      action: "ubah_alur",
      entity: "approval_workflows",
      entityId: workflowId,
      description: `Alur "${updated.name}" diperbarui (${steps.length} tahapan)`,
      metadata: { steps: steps.map((s) => s.label) },
    });
    return jsonOk({ item: { ...updated, steps } });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("alur.kelola")) {
      return jsonOk({ error: "Hanya Super Admin yang dapat menghapus alur persetujuan." }, 403);
    }
    const { id } = await context.params;
    const workflowId = Number(id);
    const workflow = await load(workflowId);
    if (!workflow) return jsonOk({ error: "Alur tidak ditemukan." }, 404);

    const used = await db.select({ id: letters.id }).from(letters).where(eq(letters.workflowId, workflowId)).limit(1);
    if (used[0]) {
      await db.update(approvalWorkflows).set({ isActive: false, updatedAt: new Date() }).where(eq(approvalWorkflows.id, workflowId));
      await logAudit({
        actor,
        action: "nonaktifkan_alur",
        entity: "approval_workflows",
        entityId: workflowId,
        description: `Alur "${workflow.name}" dinonaktifkan karena masih digunakan surat`,
      });
      return jsonOk({ error: "Alur masih digunakan surat sehingga dinonaktifkan." }, 409);
    }

    await db.delete(approvalWorkflows).where(eq(approvalWorkflows.id, workflowId));
    await logAudit({
      actor,
      action: "hapus_alur",
      entity: "approval_workflows",
      entityId: workflowId,
      description: `Alur "${workflow.name}" dihapus`,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
