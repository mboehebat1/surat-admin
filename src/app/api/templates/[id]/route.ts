import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { letterTemplates, letters, templateFields } from "@/db/schema";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";
import { cleanDocxWatermarks, extractPlaceholders, extractPlaceholdersFromDocx } from "@/lib/documents";
import { overwriteStoredFile, saveUploadedFile } from "@/lib/storage";
import { syncTemplateFields } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function loadTemplate(id: number) {
  const rows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    const template = await loadTemplate(Number(id));
    if (!template) return jsonOk({ error: "Template tidak ditemukan." }, 404);
    const fields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.templateId, template.id))
      .orderBy(asc(templateFields.sortOrder));
    return jsonOk({ item: template, fields, placeholders: extractPlaceholders(template.bodyTemplate ?? "") });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requirePermission("template.kelola");
    const { id } = await context.params;
    const templateId = Number(id);
    const template = await loadTemplate(templateId);
    if (!template) return jsonOk({ error: "Template tidak ditemukan." }, 404);

    const form = await request.formData();
    const text = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value.trim() : undefined;
    };
    const docxFile = form.get("docxFile");
    const pdfFile = form.get("pdfFile");

    const update: Partial<typeof letterTemplates.$inferInsert> = {};
    if (text("name")) update.name = text("name");
    if (text("description") !== undefined) update.description = text("description") || null;
    // Kategori opsional: nilai kosong/"0" mengosongkan kategori template.
    if (text("categoryId") !== undefined) update.categoryId = Number(text("categoryId")) || null;
    if (text("bodyTemplate") !== undefined) update.bodyTemplate = text("bodyTemplate") || null;
    if (text("numberingFormat")) update.numberingFormat = text("numberingFormat");
    if (text("kopText") !== undefined) update.kopText = text("kopText") || null;
    if (text("signerName") !== undefined) update.signerName = text("signerName") || null;
    if (text("signerPosition") !== undefined) update.signerPosition = text("signerPosition") || null;
    if (text("isActive")) update.isActive = text("isActive") !== "false";
    update.updatedAt = new Date();

    let detected: string[] = [];
    if (docxFile instanceof File && docxFile.size > 0) {
      const saved = await saveUploadedFile(`templates/${template.code.toLowerCase()}`, docxFile);
      // Watermark nama instansi dibuang dari berkas simpanan agar cetakan bersih.
      const cleaned = cleanDocxWatermarks(saved.buffer);
      if (cleaned !== saved.buffer) await overwriteStoredFile(saved.storagePath, cleaned);
      update.docxPath = saved.storagePath;
      update.docxName = docxFile.name;
      detected = await extractPlaceholdersFromDocx(cleaned);
    } else if (text("removeDocx") === "1") {
      update.docxPath = null;
      update.docxName = null;
    }
    if (pdfFile instanceof File && pdfFile.size > 0) {
      const saved = await saveUploadedFile(`templates/${template.code.toLowerCase()}`, pdfFile);
      update.pdfPath = saved.storagePath;
      update.pdfName = pdfFile.name;
    } else if (text("removePdf") === "1") {
      update.pdfPath = null;
      update.pdfName = null;
    }

    const [updated] = await db.update(letterTemplates).set(update).where(eq(letterTemplates.id, templateId)).returning();

    const merged = Array.from(
      new Set([...detected, ...extractPlaceholders(updated.bodyTemplate ?? "")]),
    );
    if (merged.length) {
      await syncTemplateFields(templateId, merged, updated.bodyTemplate);
      const rawFields = form.get("fieldsConfig");
      if (typeof rawFields === "string" && rawFields.trim()) {
        try {
          const configs = JSON.parse(rawFields) as { key: string; label?: string; type?: string; isRequired?: boolean }[];
          for (const config of configs) {
            if (!config.key) continue;
            await db
              .update(templateFields)
              .set({
                label: config.label || undefined,
                type: config.type || undefined,
                isRequired: config.isRequired ?? undefined,
                source: "manual",
              })
              .where(
                and(eq(templateFields.templateId, templateId), eq(templateFields.key, config.key)),
              );
          }
        } catch {
          // abaikan konfigurasi field yang tidak valid
        }
      }
    }

    await logAudit({
      actor,
      action: "ubah_template",
      entity: "letter_templates",
      entityId: templateId,
      description: `Template "${updated.name}" diperbarui${detected.length ? ` (${detected.length} placeholder baru)` : ""}`,
      metadata: { detected, changes: Object.keys(update) },
    });

    const fields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.templateId, templateId))
      .orderBy(asc(templateFields.sortOrder));
    return jsonOk({ item: updated, fields, detected });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requirePermission("template.kelola");
    const { id } = await context.params;
    const templateId = Number(id);
    const template = await loadTemplate(templateId);
    if (!template) return jsonOk({ error: "Template tidak ditemukan." }, 404);

    const used = await db.select({ id: letters.id }).from(letters).where(eq(letters.templateId, templateId)).limit(1);
    if (used[0]) {
      await db.update(letterTemplates).set({ isActive: false, updatedAt: new Date() }).where(eq(letterTemplates.id, templateId));
      await logAudit({
        actor,
        action: "nonaktifkan_template",
        entity: "letter_templates",
        entityId: templateId,
        description: `Template "${template.name}" dinonaktifkan karena masih dipakai surat`,
      });
      return jsonOk(
        { error: "Template sudah digunakan oleh surat. Template dinonaktifkan, bukan dihapus." },
        409,
      );
    }

    await db.delete(letterTemplates).where(eq(letterTemplates.id, templateId));
    await logAudit({
      actor,
      action: "hapus_template",
      entity: "letter_templates",
      entityId: templateId,
      description: `Template "${template.name}" dihapus`,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
