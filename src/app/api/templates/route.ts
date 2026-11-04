import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { letterCategories, letterTemplates, letters, templateFields } from "@/db/schema";
import { requirePermission, requireUser, type SessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";
import { cleanDocxWatermarks, extractPlaceholders, extractPlaceholdersFromDocx } from "@/lib/documents";
import { overwriteStoredFile, saveUploadedFile } from "@/lib/storage";
import { syncTemplateFields } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("template.lihat") && !actor.permissions.includes("surat.buat")) {
      return jsonOk({ error: "Anda tidak berhak melihat daftar template." }, 403);
    }
    const url = new URL(request.url);
    const categoryId = url.searchParams.get("categoryId");
    const search = url.searchParams.get("q");
    const activeOnly = url.searchParams.get("active") === "1";

    const conditions = [];
    if (categoryId) conditions.push(eq(letterTemplates.categoryId, Number(categoryId)));
    if (activeOnly) conditions.push(eq(letterTemplates.isActive, true));
    if (search) {
      const term = `%${search}%`;
      conditions.push(or(ilike(letterTemplates.name, term), ilike(letterTemplates.code, term)));
    }

    const rows = await db
      .select({
        template: letterTemplates,
        category: letterCategories,
        fieldCount: sql<number>`(select count(*)::int from ${templateFields} where ${templateFields.templateId} = ${letterTemplates.id})`,
        usedCount: sql<number>`(select count(*)::int from ${letters} where ${letters.templateId} = ${letterTemplates.id})`,
      })
      .from(letterTemplates)
      .leftJoin(letterCategories, eq(letterCategories.id, letterTemplates.categoryId))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(letterTemplates.categoryId), asc(letterTemplates.name));

    const withFields = await Promise.all(
      rows.map(async (row) => ({
        ...row.template,
        categoryName: row.category?.name ?? null,
        categoryCode: row.category?.code ?? null,
        fieldCount: row.fieldCount,
        usedCount: row.usedCount,
        fields: await db
          .select()
          .from(templateFields)
          .where(eq(templateFields.templateId, row.template.id))
          .orderBy(asc(templateFields.sortOrder)),
      })),
    );

    return jsonOk({ items: withFields });
  } catch (error) {
    return jsonError(error);
  }
}

type FieldConfig = {
  key: string;
  label?: string;
  type?: string;
  isRequired?: boolean;
  defaultValue?: string;
  placeholder?: string;
  helpText?: string;
  options?: string[];
};

async function readTemplateForm(request: Request) {
  const form = await request.formData();
  const text = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };
  const file = (key: string) => {
    const value = form.get(key);
    return value instanceof File && value.size > 0 ? value : null;
  };
  let fieldConfigs: FieldConfig[] = [];
  const rawFields = form.get("fieldsConfig");
  if (typeof rawFields === "string" && rawFields.trim()) {
    try {
      fieldConfigs = JSON.parse(rawFields) as FieldConfig[];
    } catch {
      fieldConfigs = [];
    }
  }
  return {
    name: text("name"),
    code: text("code").toUpperCase(),
    // Kategori opsional: kosong/"0" berarti tanpa kategori.
    categoryId: Number(text("categoryId")) || null,
    description: text("description") || null,
    bodyTemplate: text("bodyTemplate") || null,
    numberingFormat: text("numberingFormat") || "{nomor}/{kode}/{org}/{bulan}/{tahun}",
    kopText: text("kopText") || null,
    signerName: text("signerName") || null,
    signerPosition: text("signerPosition") || null,
    isActive: text("isActive") !== "false",
    docxFile: file("docxFile"),
    pdfFile: file("pdfFile"),
    fieldConfigs,
  };
}

async function persistTemplateFiles(
  slug: string,
  docxFile: File | null,
  pdfFile: File | null,
): Promise<{ docxPath?: string; docxName?: string; pdfPath?: string; pdfName?: string; detected: string[] }> {
  const detected: string[] = [];
  const result: { docxPath?: string; docxName?: string; pdfPath?: string; pdfName?: string; detected: string[] } = { detected };

  if (docxFile) {
    const saved = await saveUploadedFile(`templates/${slug}`, docxFile);
    // Watermark nama instansi di header Word dibuang agar hasil cetak bersih.
    const cleaned = cleanDocxWatermarks(saved.buffer);
    if (cleaned !== saved.buffer) await overwriteStoredFile(saved.storagePath, cleaned);
    result.docxPath = saved.storagePath;
    result.docxName = docxFile.name;
    result.detected = await extractPlaceholdersFromDocx(cleaned);
  }
  if (pdfFile) {
    const saved = await saveUploadedFile(`templates/${slug}`, pdfFile);
    result.pdfPath = saved.storagePath;
    result.pdfName = pdfFile.name;
  }
  return result;
}

async function applyFieldConfigs(templateId: number, configs: FieldConfig[]) {
  for (const config of configs) {
    if (!config.key) continue;
    await db
      .update(templateFields)
      .set({
        label: config.label || undefined,
        type: config.type || undefined,
        isRequired: config.isRequired ?? undefined,
        defaultValue: config.defaultValue ?? undefined,
        placeholder: config.placeholder ?? undefined,
        helpText: config.helpText ?? undefined,
        options: config.options ?? undefined,
        source: "manual",
      })
      .where(sql`${templateFields.templateId} = ${templateId} and ${templateFields.key} = ${config.key}`);
  }
}

export async function POST(request: Request) {
  try {
    const actor: SessionUser = await requirePermission("template.kelola");
    const form = await readTemplateForm(request);
    if (!form.name || form.name.length < 3) return jsonOk({ error: "Nama template minimal 3 karakter." }, 400);
    if (!form.code) return jsonOk({ error: "Kode template wajib diisi." }, 400);

    const duplicate = await db.select().from(letterTemplates).where(eq(letterTemplates.code, form.code)).limit(1);
    if (duplicate[0]) return jsonOk({ error: `Kode template "${form.code}" sudah digunakan.` }, 409);

    const files = await persistTemplateFiles(form.code.toLowerCase(), form.docxFile, form.pdfFile);
    const [row] = await db
      .insert(letterTemplates)
      .values({
        name: form.name,
        code: form.code,
        categoryId: form.categoryId,
        description: form.description,
        bodyTemplate: form.bodyTemplate,
        numberingFormat: form.numberingFormat,
        kopText: form.kopText,
        signerName: form.signerName,
        signerPosition: form.signerPosition,
        docxPath: files.docxPath ?? null,
        docxName: files.docxName ?? null,
        pdfPath: files.pdfPath ?? null,
        pdfName: files.pdfName ?? null,
        isActive: form.isActive,
        createdBy: actor.id,
      })
      .returning();

    const detected = Array.from(new Set([...files.detected, ...extractPlaceholders(form.bodyTemplate ?? "")]));
    await syncTemplateFields(row.id, detected, form.bodyTemplate);
    await applyFieldConfigs(row.id, form.fieldConfigs);

    await logAudit({
      actor,
      action: "tambah_template",
      entity: "letter_templates",
      entityId: row.id,
      description: `Template "${row.name}" dibuat dengan ${detected.length} field terdeteksi`,
      metadata: { detected, docx: files.docxName ?? null },
    });

    const fields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.templateId, row.id))
      .orderBy(asc(templateFields.sortOrder));
    return jsonOk({ item: row, fields, detected }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
