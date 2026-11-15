import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { letterAttachments, letters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { ATTACHMENT_EDITABLE_STATUSES, canAccessLetter, canModifyAttachments, jsonError, jsonOk } from "@/lib/api";
import { readStoredFile } from "@/lib/storage";
import { generateLetterDocuments } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; attachmentId: string }> };

async function load(context: Context) {
  const { id, attachmentId } = await context.params;
  const rows = await db
    .select({ attachment: letterAttachments, letter: letters })
    .from(letterAttachments)
    .innerJoin(letters, eq(letters.id, letterAttachments.letterId))
    .where(and(eq(letterAttachments.id, Number(attachmentId)), eq(letterAttachments.letterId, Number(id))))
    .limit(1);
  return rows[0] ?? null;
}

export async function GET(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const row = await load(context);
    if (!row) return jsonOk({ error: "Lampiran tidak ditemukan." }, 404);
    if (!canAccessLetter(actor, row.letter)) return jsonOk({ error: "Akses ditolak." }, 403);

    const buffer =
      row.attachment.content ?? (await readStoredFile(row.attachment.storagePath));
    const download = new URL(request.url).searchParams.get("download") === "1";

    await logAudit({
      actor,
      action: download ? "unduh_lampiran" : "lihat_lampiran",
      entity: "letter_attachments",
      entityId: row.attachment.id,
      description: `${actor.name} ${download ? "mengunduh" : "membuka"} lampiran "${row.attachment.originalName}"`,
    });

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": row.attachment.mimeType ?? "application/octet-stream",
        "Content-Length": String(buffer.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${row.attachment.originalName}"`,
        "Cache-Control": "private, max-age=0, no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ENOENT")) {
      return jsonOk({ error: "Berkas tidak tersedia di penyimpanan." }, 404);
    }
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const row = await load(context);
    if (!row) return jsonOk({ error: "Lampiran tidak ditemukan." }, 404);
    // Aturan hapus disamakan dengan unggah agar lampiran surat lama bisa DIGANTI,
    // bukan hanya ditambah (sebelumnya admin bisa menambah tetapi tidak menghapus).
    const allowed =
      canModifyAttachments(actor, row.letter) ||
      (row.attachment.uploadedBy === actor.id &&
        (ATTACHMENT_EDITABLE_STATUSES as readonly string[]).includes(row.letter.status));
    if (!allowed) return jsonOk({ error: "Akses ditolak." }, 403);

    await db.delete(letterAttachments).where(eq(letterAttachments.id, row.attachment.id));

    // Dokumen surat dibentuk ulang supaya berkas yang dihapus hilang dari hasil cetak.
    if (row.letter.pdfPath || row.letter.docxPath) {
      try {
        await generateLetterDocuments(row.letter.id, actor);
      } catch {
        // kegagalan pembentukan ulang tidak membatalkan penghapusan
      }
    }

    await logAudit({
      actor,
      action: "hapus_lampiran",
      entity: "letter_attachments",
      entityId: row.attachment.id,
      description: `Lampiran "${row.attachment.originalName}" dihapus`,
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
