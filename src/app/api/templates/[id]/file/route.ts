import { eq } from "drizzle-orm";
import { db } from "@/db";
import { letterTemplates } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";
import { readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const MIME: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
};

/** Unduh berkas template (DOCX/PDF) yang sedang dipakai sebagai acuan surat. */
export async function GET(request: Request, context: Context) {
  try {
    await requireUser();
    const { id } = await context.params;
    const templateId = Number(id);
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "pdf" ? "pdf" : "docx";

    const rows = await db.select().from(letterTemplates).where(eq(letterTemplates.id, templateId)).limit(1);
    const template = rows[0];
    if (!template) return jsonOk({ error: "Template tidak ditemukan." }, 404);

    const storedPath = format === "pdf" ? template.pdfPath : template.docxPath;
    const fileName = (format === "pdf" ? template.pdfName : template.docxName) ?? `${template.code}.${format}`;
    if (!storedPath) return jsonOk({ error: `Template belum memiliki berkas ${format.toUpperCase()}.` }, 404);

    let buffer: Buffer;
    try {
      buffer = await readStoredFile(storedPath);
    } catch {
      return jsonOk({ error: `Berkas ${format.toUpperCase()} tidak ditemukan pada penyimpanan.` }, 404);
    }

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": MIME[format],
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${
          url.searchParams.get("inline") === "1" ? "inline" : "attachment"
        }; filename="${fileName.replace(/["\\]/g, "_")}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
