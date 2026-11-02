import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { letterCategories, letterTemplates, letters, templateFields } from "@/db/schema";
import { requirePermission, requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk, parseList, parseIntOrNull, readJson } from "@/lib/api";
import { fetchLetters } from "@/lib/queries";
import { renderTemplateText } from "@/lib/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  templateId: z.number().int().positive("Template wajib dipilih."),
  title: z.string().trim().min(5, "Perihal surat minimal 5 karakter.").max(300),
  recipientName: z.string().trim().min(2, "Nama penerima wajib diisi.").max(200),
  recipientPosition: z.string().trim().max(200).optional().nullable(),
  recipientAddress: z.string().trim().max(400).optional().nullable(),
  letterDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal harus YYYY-MM-DD."),
  classification: z.enum(["biasa", "penting", "rahasia", "segera"]).default("biasa"),
  priority: z.enum(["normal", "tinggi", "mendesak"]).default("normal"),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).default({}),
  bodyText: z.string().trim().max(20000).optional().nullable(),
  departmentId: z.number().int().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") as "all" | "mine" | "pending" | "archive" | null;
    const effectiveScope = actor.roleCode === "pembuat_surat" && scope !== "archive" ? "mine" : (scope ?? "all");

    const result = await fetchLetters({
      search: url.searchParams.get("q") ?? undefined,
      status: parseList(url.searchParams.get("status")),
      categoryId: parseIntOrNull(url.searchParams.get("categoryId")),
      departmentId: parseIntOrNull(url.searchParams.get("departmentId")),
      senderId: parseIntOrNull(url.searchParams.get("senderId")),
      approverRole: url.searchParams.get("approverRole"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      scope: effectiveScope ?? "all",
      actorId: actor.id,
      actorRole: actor.roleCode,
      limit: Math.min(Number(url.searchParams.get("limit") ?? 25) || 25, 200),
      offset: Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0),
      sort: (url.searchParams.get("sort") as "newest" | "oldest" | "number") ?? "newest",
    });
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("surat.buat");
    const payload = createSchema.parse(await readJson(request));

    const templateRows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, payload.templateId)).limit(1);
    const template = templateRows[0];
    if (!template) return jsonOk({ error: "Template tidak ditemukan." }, 404);
    if (!template.isActive) return jsonOk({ error: "Template tidak aktif dan tidak dapat digunakan." }, 400);

    // Template boleh tanpa kategori — lewati pencarian bila kosong.
    const categoryRows = template.categoryId
      ? await db.select().from(letterCategories).where(eq(letterCategories.id, template.categoryId)).limit(1)
      : [];
    const fields = await db
      .select()
      .from(templateFields)
      .where(eq(templateFields.templateId, template.id))
      .orderBy(asc(templateFields.sortOrder));

    const missing = fields
      .filter((field) => field.isRequired)
      .filter((field) => {
        const value = payload.data[field.key];
        return value === undefined || value === null || String(value).trim() === "";
      })
      .map((field) => field.label);
    if (missing.length) {
      return jsonOk({ error: `Field wajib belum diisi: ${missing.join(", ")}.` }, 400);
    }

    const bodyText = payload.bodyText?.trim()
      ? payload.bodyText
      : renderTemplateText(template.bodyTemplate ?? "", payload.data as Record<string, unknown>);

    const [letter] = await db
      .insert(letters)
      .values({
        title: payload.title,
        categoryId: template.categoryId,
        templateId: template.id,
        departmentId: payload.departmentId ?? actor.departmentId,
        senderId: actor.id,
        recipientName: payload.recipientName,
        recipientPosition: payload.recipientPosition ?? null,
        recipientAddress: payload.recipientAddress ?? null,
        letterDate: payload.letterDate,
        classification: payload.classification,
        priority: payload.priority,
        data: payload.data,
        bodyText,
        status: "draft",
        stageEnteredAt: new Date(),
      })
      .returning();

    await db.update(letterTemplates).set({ usageCount: template.usageCount + 1 }).where(eq(letterTemplates.id, template.id));
    await logAudit({
      actor,
      action: "buat_surat",
      entity: "letters",
      entityId: letter.id,
      description: `Draft surat "${letter.title}" dibuat menggunakan template ${template.name}`,
      metadata: { templateId: template.id, category: categoryRows[0]?.name ?? null },
    });

    return jsonOk({ item: letter }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
