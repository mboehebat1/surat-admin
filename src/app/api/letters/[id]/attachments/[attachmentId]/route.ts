import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { letterAttachments, letters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canAccessLetter, jsonError, jsonOk } from "@/lib/api";
import { readStoredFile } from "@/lib/storage";

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
    const allowed =
      row.attachment.uploadedBy === actor.id ||
      row.letter.senderId === actor.id ||
      ["super_admin", "admin_persuratan"].includes(actor.roleCode);
    if (!allowed) return jsonOk({ error: "Akses ditolak." }, 403);
    if (!["draft", "revisi"].includes(row.letter.status) && actor.roleCode !== "super_admin") {
      return jsonOk({ error: "Lampiran hanya dapat dihapus saat surat berstatus Draft atau Revisi." }, 400);
    }

    await db.delete(letterAttachments).where(eq(letterAttachments.id, row.attachment.id));
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
