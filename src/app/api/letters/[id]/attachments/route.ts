import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { letterAttachments, letters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { canAccessLetter, jsonError, jsonOk } from "@/lib/api";
import { saveUploadedFile, sanitizeFileName } from "@/lib/storage";
import { WorkflowError } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const letterId = Number(id);
    const letterRows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
    if (!letterRows[0]) return jsonOk({ error: "Surat tidak ditemukan." }, 404);
    if (!canAccessLetter(actor, letterRows[0])) return jsonOk({ error: "Akses ditolak." }, 403);
    const items = await db
      .select()
      .from(letterAttachments)
      .where(eq(letterAttachments.letterId, letterId))
      .orderBy(asc(letterAttachments.id));
    return jsonOk({ items });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const letterId = Number(id);
    const letterRows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
    const letter = letterRows[0];
    if (!letter) return jsonOk({ error: "Surat tidak ditemukan." }, 404);
    if (!canAccessLetter(actor, letter)) return jsonOk({ error: "Akses ditolak." }, 403);
    if (letter.senderId !== actor.id && !["super_admin", "admin_persuratan"].includes(actor.roleCode)) {
      throw new WorkflowError("Hanya pembuat surat atau admin yang dapat mengunggah lampiran.", 403);
    }
    if (!["draft", "revisi", "ditolak"].includes(letter.status) && !["super_admin", "admin_persuratan"].includes(actor.roleCode)) {
      throw new WorkflowError("Lampiran hanya dapat ditambahkan saat surat berstatus Draft atau Revisi.", 400);
    }

    const form = await request.formData();
    const files: File[] = [];
    for (const value of form.getAll("files")) if (value instanceof File && value.size > 0) files.push(value);
    const single = form.get("file");
    if (single instanceof File && single.size > 0) files.push(single);
    if (!files.length) throw new WorkflowError("Tidak ada berkas yang diterima.", 400);

    const created = [];
    for (const file of files) {
      const saved = await saveUploadedFile(`letters/${letterId}/attachments`, file);
      const [row] = await db
        .insert(letterAttachments)
        .values({
          letterId,
          originalName: sanitizeFileName(file.name),
          storedName: saved.storedName,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          storagePath: saved.storagePath,
          uploadedBy: actor.id,
        })
        .returning();
      created.push(row);
    }

    await logAudit({
      actor,
      action: "unggah_lampiran",
      entity: "letters",
      entityId: letterId,
      description: `${created.length} lampiran diunggah ke surat "${letter.title}"`,
      metadata: { files: created.map((c) => c.originalName) },
    });

    return jsonOk({ items: created }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
