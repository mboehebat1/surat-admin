import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { letterTemplates, templateFields } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("template.kelola");
    const { id } = await context.params;
    const rows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, Number(id))).limit(1);
    const source = rows[0];
    if (!source) return jsonOk({ error: "Template tidak ditemukan." }, 404);

    const suffix = Date.now().toString().slice(-4);
    const [copy] = await db
      .insert(letterTemplates)
      .values({
        ...source,
        id: undefined,
        code: `${source.code}-SALINAN-${suffix}`.slice(0, 40),
        name: `${source.name} (Salinan)`,
        usageCount: 0,
        createdBy: actor.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    const fields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.templateId, source.id))
      .orderBy(asc(templateFields.sortOrder));
    if (fields.length) {
      await db.insert(templateFields).values(
        fields.map((field) => ({ ...field, id: undefined, templateId: copy.id })),
      );
    }

    await logAudit({
      actor,
      action: "duplikasi_template",
      entity: "letter_templates",
      entityId: copy.id,
      description: `Template "${source.name}" diduplikasi menjadi "${copy.name}"`,
    });
    return jsonOk({ item: copy }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
