import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { approvalSteps, approvalWorkflows, departments, letterCategories } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stepSchema = z.object({
  label: z.string().trim().min(3, "Nama tahap minimal 3 karakter."),
  roleCode: z.string().min(1, "Role penanggung jawab wajib dipilih."),
  slaHours: z.number().int().min(1).max(720).default(24),
  description: z.string().trim().max(300).optional().nullable(),
});

const workflowSchema = z.object({
  code: z.string().trim().min(3).max(30).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(4, "Nama alur minimal 4 karakter."),
  description: z.string().trim().max(400).optional().nullable(),
  categoryId: z.number().int().nullable().optional(),
  departmentId: z.number().int().nullable().optional(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  steps: z.array(stepSchema).min(1, "Alur minimal memiliki satu tahapan.").max(8),
});

export async function GET() {
  try {
    await requireUser();
    const rows = await db
      .select({ workflow: approvalWorkflows, category: letterCategories, department: departments })
      .from(approvalWorkflows)
      .leftJoin(letterCategories, eq(letterCategories.id, approvalWorkflows.categoryId))
      .leftJoin(departments, eq(departments.id, approvalWorkflows.departmentId))
      .orderBy(asc(approvalWorkflows.code));

    const steps = await db.select().from(approvalSteps).orderBy(asc(approvalSteps.workflowId), asc(approvalSteps.stepOrder));
    return jsonOk({
      items: rows.map((row) => ({
        ...row.workflow,
        categoryName: row.category?.name ?? "Semua Kategori",
        categoryCode: row.category?.code ?? null,
        departmentName: row.department?.name ?? null,
        steps: steps.filter((step) => step.workflowId === row.workflow.id),
        usedCount: 0,
      })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("alur.kelola")) {
      return jsonOk({ error: "Hanya Super Admin yang dapat membuat alur persetujuan." }, 403);
    }
    const payload = workflowSchema.parse(await readJson(request));
    const existing = await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.code, payload.code)).limit(1);
    if (existing[0]) return jsonOk({ error: `Kode alur "${payload.code}" sudah digunakan.` }, 409);

    if (payload.isDefault) {
      await db.update(approvalWorkflows).set({ isDefault: false });
    }

    const [workflow] = await db
      .insert(approvalWorkflows)
      .values({
        code: payload.code,
        name: payload.name,
        description: payload.description ?? null,
        categoryId: payload.categoryId ?? null,
        departmentId: payload.departmentId ?? null,
        isDefault: payload.isDefault,
        isActive: payload.isActive,
        createdBy: actor.id,
      })
      .returning();

    await db.insert(approvalSteps).values(
      payload.steps.map((step, index) => ({
        workflowId: workflow.id,
        stepOrder: index + 1,
        label: step.label,
        roleCode: step.roleCode,
        slaHours: step.slaHours,
        description: step.description ?? null,
        isRequired: true,
      })),
    );

    await logAudit({
      actor,
      action: "tambah_alur",
      entity: "approval_workflows",
      entityId: workflow.id,
      description: `Alur persetujuan "${workflow.name}" dibuat dengan ${payload.steps.length} tahapan`,
      metadata: { steps: payload.steps.map((s) => s.label) },
    });
    return jsonOk({ item: workflow }, 201);
  } catch (error) {
    return jsonError(error);
  }
}


