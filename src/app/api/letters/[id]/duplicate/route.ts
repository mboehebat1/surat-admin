import { eq } from "drizzle-orm";
import { db } from "@/db";
import { letters } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePermission("surat.buat");
    const { id } = await context.params;
    const rows = await db.select().from(letters).where(eq(letters.id, Number(id))).limit(1);
    const source = rows[0];
    if (!source) return jsonOk({ error: "Surat tidak ditemukan." }, 404);

    const [copy] = await db
      .insert(letters)
      .values({
        title: source.title,
        categoryId: source.categoryId,
        templateId: source.templateId,
        departmentId: actor.departmentId ?? source.departmentId,
        senderId: actor.id,
        recipientName: source.recipientName,
        recipientPosition: source.recipientPosition,
        recipientAddress: source.recipientAddress,
        letterDate: new Date().toISOString().slice(0, 10),
        classification: source.classification,
        priority: source.priority,
        data: source.data ?? {},
        bodyText: source.bodyText,
        status: "draft",
        stageEnteredAt: new Date(),
      })
      .returning();

    await logAudit({
      actor,
      action: "duplikasi_surat",
      entity: "letters",
      entityId: copy.id,
      description: `Surat "${source.title}" diduplikasi menjadi draft baru #${copy.id}`,
      metadata: { sourceId: source.id },
    });
    return jsonOk({ item: copy }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
