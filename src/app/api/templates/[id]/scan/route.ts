import { eq } from "drizzle-orm";
import { db } from "@/db";
import { letterTemplates } from "@/db/schema";
import { requirePermission, requireUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { extractPlaceholders, extractPlaceholdersFromDocx } from "@/lib/documents";
import { readStoredFile } from "@/lib/storage";
import { syncTemplateFields } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Menyelaraskan field formulir dengan berkas DOCX yang sedang dipakai template.
 *
 * Berguna saat template diubah: placeholder yang ditambahkan/dihapus di dokumen
 * Word langsung tercermin pada formulir surat tanpa perlu mengunggah ulang.
 */
export async function GET(_request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    const templateId = Number(id);
    if (!Number.isFinite(templateId)) return jsonOk({ error: "ID template tidak valid." }, 400);

    const rows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, templateId)).limit(1);
    const template = rows[0];
    if (!template) return jsonOk({ error: "Template tidak ditemukan." }, 404);

    const fromBody = extractPlaceholders(template.bodyTemplate ?? "");
    let fromDocx: string[] = [];
    let docxError: string | null = null;

    if (template.docxPath) {
      try {
        const buffer = await readStoredFile(template.docxPath);
        fromDocx = await extractPlaceholdersFromDocx(buffer);
      } catch {
        docxError = "Berkas DOCX tidak dapat dibaca (mungkin hilang dari penyimpanan).";
      }
    }

    return jsonOk({
      placeholders: {
        body: fromBody,
        docx: fromDocx,
        all: Array.from(new Set([...fromDocx, ...fromBody])),
      },
      docxName: template.docxName,
      docxError,
    });
  } catch (error) {
    return jsonError(error);
  }
}

/** Pindai ulang berkas DOCX lalu sinkronkan daftar field template. */
export async function POST(_request: Request, context: Context) {
  try {
    const actor = await requirePermission("template.kelola");
    const { id } = await context.params;
    const templateId = Number(id);
    if (!Number.isFinite(templateId)) return jsonOk({ error: "ID template tidak valid." }, 400);

    const rows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, templateId)).limit(1);
    const template = rows[0];
    if (!template) return jsonOk({ error: "Template tidak ditemukan." }, 404);
    if (!template.docxPath) {
      return jsonOk({ error: "Template ini belum memiliki berkas DOCX. Unggah dokumen terlebih dahulu." }, 400);
    }

    let fromDocx: string[] = [];
    try {
      const buffer = await readStoredFile(template.docxPath);
      fromDocx = await extractPlaceholdersFromDocx(buffer);
    } catch {
      return jsonOk({ error: "Berkas DOCX tidak dapat dibaca. Coba unggah ulang dokumen." }, 400);
    }

    const keys = Array.from(new Set([...fromDocx, ...extractPlaceholders(template.bodyTemplate ?? "")]));
    await syncTemplateFields(templateId, keys, template.bodyTemplate);
    await db.update(letterTemplates).set({ updatedAt: new Date() }).where(eq(letterTemplates.id, templateId));

    const { logAudit } = await import("@/lib/audit");
    await logAudit({
      actor,
      action: "pindai_template",
      entity: "letter_templates",
      entityId: templateId,
      description: `Placeholder template "${template.name}" dipindai ulang dari DOCX (${fromDocx.length} placeholder)`,
      metadata: { detected: fromDocx },
    });

    return jsonOk({
      detected: fromDocx,
      total: keys.length,
      message: `${keys.length} field diselaraskan dengan berkas ${template.docxName ?? "DOCX"}.`,
    });
  } catch (error) {
    return jsonError(error);
  }
}
