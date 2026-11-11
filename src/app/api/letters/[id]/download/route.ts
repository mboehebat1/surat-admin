import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { letters, letterAttachments } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canAccessLetter, jsonError, jsonOk } from "@/lib/api";
import { buildLetterBuffers } from "@/lib/workflow";
import { readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const letterId = Number(id);
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "docx" ? "docx" : "pdf";

    const rows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
    const letter = rows[0];
    if (!letter) return jsonOk({ error: "Surat tidak ditemukan." }, 404);
    if (!canAccessLetter(actor, letter)) return jsonOk({ error: "Akses ditolak." }, 403);

    const storedPath = format === "docx" ? letter.docxPath : letter.pdfPath;
    // `fresh=1` memaksa dokumen dibentuk ulang dari template terbaru — dipakai
    // agar hasil cetak selalu bebas watermark dan mengikuti berkas acuan.
    // Bila surat punya lampiran, dokumen SELALU dibentuk ulang agar dokumen
    // pendukung benar-benar ikut tercetak (berkas lama belum memuatnya).
    const attachmentRows = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(letterAttachments)
      .where(eq(letterAttachments.letterId, letterId));
    const hasAttachments = (attachmentRows[0]?.total ?? 0) > 0;
    const fresh = url.searchParams.get("fresh") === "1" || hasAttachments;
    let buffer: Buffer;
    let fileName: string;

    if (fresh) {
      buffer = await regenerate(letterId, format);
    } else if (storedPath) {
      try {
        buffer = await readStoredFile(storedPath);
      } catch {
        buffer = await regenerate(letterId, format);
      }
    } else {
      buffer = await regenerate(letterId, format);
    }

    const safeNumber = (letter.letterNumber || `surat-${letterId}`).replace(/[^\w.-]+/g, "_");
    fileName = `${safeNumber}.${format}`;

    await logAudit({
      actor,
      action: "unduh_dokumen",
      entity: "letters",
      entityId: letterId,
      description: `${actor.name} mengunduh dokumen ${format.toUpperCase()} "${letter.title}"`,
      metadata: { format, letterNumber: letter.letterNumber },
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          format === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "application/pdf",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${url.searchParams.get("inline") === "1" ? "inline" : "attachment"}; filename="${fileName}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

/**
 * Dokumen dibuat ulang saat berkas belum tersedia (mis. surat masih draft atau
 * berkas hasil persetujuan belum sempat disimpan).
 */
async function regenerate(letterId: number, format: "docx" | "pdf") {
  const bundle = await buildLetterBuffers(letterId);
  if (!bundle) throw new Error("Surat tidak ditemukan.");
  return format === "docx" ? bundle.docx : bundle.pdf;
}
