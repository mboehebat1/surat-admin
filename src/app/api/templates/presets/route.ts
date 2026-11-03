import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { letterCategories, letterTemplates, templateFields } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { extractPlaceholders } from "@/lib/documents";
import { syncTemplateFields } from "@/lib/workflow";
import { PRESET_CODES, TEMPLATE_PRESETS, type TemplatePreset } from "@/lib/template-presets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "missing" | "refresh";

/** Terapkan label, tipe, dan bantuan dari blueprint ke field yang sudah disinkronkan. */
async function applyPresetFields(templateId: number, preset: TemplatePreset) {
  for (const field of preset.fields) {
    await db
      .update(templateFields)
      .set({
        label: field.label,
        type: field.type ?? undefined,
        isRequired: field.isRequired ?? undefined,
        helpText: field.helpText ?? null,
        placeholder: field.placeholder ?? null,
        source: "manual",
      })
      .where(sql`${templateFields.templateId} = ${templateId} and ${templateFields.key} = ${field.key}`);
  }
}

export async function GET() {
  try {
    await requirePermission("template.lihat");
    const rows = await db
      .select({ code: letterTemplates.code, name: letterTemplates.name })
      .from(letterTemplates)
      .where(inArray(letterTemplates.code, PRESET_CODES));
    const existing = new Set(rows.map((row) => row.code));
    return jsonOk({
      items: TEMPLATE_PRESETS.map((preset) => ({
        code: preset.code,
        name: preset.name,
        categoryCode: preset.categoryCode,
        fieldCount: preset.fields.length,
        exists: existing.has(preset.code),
      })),
      installed: rows.length,
      total: TEMPLATE_PRESETS.length,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("template.kelola");
    const body = (await readJson<{ mode?: Mode }>(request).catch(() => ({ mode: "missing" as Mode }))) ?? {};
    const mode: Mode = body.mode === "refresh" ? "refresh" : "missing";

    const categoryRows = await db
      .select({ id: letterCategories.id, code: letterCategories.code })
      .from(letterCategories)
      .orderBy(asc(letterCategories.id));
    const categoryByCode = new Map(categoryRows.map((row) => [row.code, row.id]));

    const existingRows = await db
      .select({ id: letterTemplates.id, code: letterTemplates.code })
      .from(letterTemplates)
      .where(inArray(letterTemplates.code, PRESET_CODES));
    const existingByCode = new Map(existingRows.map((row) => [row.code, row.id]));

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: string[] = [];

    for (const preset of TEMPLATE_PRESETS) {
      const categoryId = preset.categoryCode ? categoryByCode.get(preset.categoryCode) ?? null : null;
      const content = {
        name: preset.name,
        description: preset.description,
        categoryId,
        bodyTemplate: preset.body,
        numberingFormat: preset.numberingFormat,
        kopText: preset.kopText,
        signerName: preset.signerName,
        signerPosition: preset.signerPosition,
      };

      const existingId = existingByCode.get(preset.code);
      if (existingId) {
        if (mode !== "refresh") {
          skipped.push(preset.code);
          continue;
        }
        await db
          .update(letterTemplates)
          .set({ ...content, isActive: true, updatedAt: new Date() })
          .where(eq(letterTemplates.id, existingId));
        await syncTemplateFields(existingId, extractPlaceholders(preset.body), preset.body);
        await applyPresetFields(existingId, preset);
        updated.push(preset.code);
        continue;
      }

      const [row] = await db
        .insert(letterTemplates)
        .values({
          code: preset.code,
          ...content,
          isActive: true,
          createdBy: actor.id,
        })
        .returning();
      await syncTemplateFields(row.id, extractPlaceholders(preset.body), preset.body);
      await applyPresetFields(row.id, preset);
      created.push(preset.code);
    }

    if (created.length || updated.length) {
      await logAudit({
        actor,
        action: mode === "refresh" ? "perbarui_template_standar" : "tambah_template_standar",
        entity: "letter_templates",
        description: `Template standar: ${created.length} ditambahkan, ${updated.length} diperbarui, ${skipped.length} dilewati`,
        metadata: { created, updated, skipped, mode },
      });
    }

    return jsonOk({
      created,
      updated,
      skipped,
      message:
        created.length || updated.length
          ? `${created.length} template ditambahkan, ${updated.length} diperbarui.`
          : "Semua template standar sudah tersedia.",
    });
  } catch (error) {
    return jsonError(error);
  }
}
