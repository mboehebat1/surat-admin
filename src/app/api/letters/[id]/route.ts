import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { letterApprovals, letterArchives, letterAttachments, letterRevisions, letters } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { logAudit, notify } from "@/lib/audit";
import { canAccessLetter, jsonError, jsonOk, readJson } from "@/lib/api";
import { fetchLetterDetail } from "@/lib/queries";
import { renderTemplateText } from "@/lib/documents";
import { letterTemplates } from "@/db/schema";
import { WorkflowError } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  title: z.string().trim().min(5).max(300).optional(),
  recipientName: z.string().trim().min(2).max(200).optional(),
  recipientPosition: z.string().trim().max(200).nullable().optional(),
  recipientAddress: z.string().trim().max(400).nullable().optional(),
  letterDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  classification: z.enum(["biasa", "penting", "rahasia", "segera"]).optional(),
  priority: z.enum(["normal", "tinggi", "mendesak"]).optional(),
  data: z.record(z.string(), z.union([z.string(), z.number(), z.null()])).optional(),
  bodyText: z.string().trim().max(20000).nullable().optional(),
  letterNumber: z.string().trim().max(80).nullable().optional(),
});

export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const detail = await fetchLetterDetail(Number(id));
    if (!detail) return jsonOk({ error: "Surat tidak ditemukan." }, 404);
    if (!canAccessLetter(actor, detail.letter)) {
      return jsonOk({ error: "Anda tidak berhak mengakses surat ini." }, 403);
    }
    return jsonOk(detail);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const letterId = Number(id);
    const rows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
    const letter = rows[0];
    if (!letter) return jsonOk({ error: "Surat tidak ditemukan." }, 404);
    if (!canAccessLetter(actor, letter)) return jsonOk({ error: "Anda tidak berhak mengubah surat ini." }, 403);

    const isOwnerOrAdmin =
      letter.senderId === actor.id || ["super_admin", "admin_persuratan"].includes(actor.roleCode);
    if (!isOwnerOrAdmin) throw new WorkflowError("Anda tidak berhak mengubah surat ini.", 403);
    if (!["draft", "revisi", "ditolak"].includes(letter.status)) {
      throw new WorkflowError(`Surat berstatus "${letter.status}" tidak dapat diubah.`, 400);
    }
    if (!actor.permissions.includes("surat.edit") && letter.status !== "draft") {
      throw new WorkflowError("Anda tidak memiliki izin mengubah surat yang sedang diproses.", 403);
    }

    const payload = updateSchema.parse(await readJson(request));
    const update: Partial<typeof letters.$inferInsert> = { updatedAt: new Date() };

    if (payload.title !== undefined) update.title = payload.title;
    if (payload.recipientName !== undefined) update.recipientName = payload.recipientName;
    if (payload.recipientPosition !== undefined) update.recipientPosition = payload.recipientPosition;
    if (payload.recipientAddress !== undefined) update.recipientAddress = payload.recipientAddress;
    if (payload.letterDate !== undefined) update.letterDate = payload.letterDate;
    if (payload.classification !== undefined) update.classification = payload.classification;
    if (payload.priority !== undefined) update.priority = payload.priority;
    if (payload.letterNumber !== undefined && ["super_admin", "admin_persuratan"].includes(actor.roleCode)) {
      update.letterNumber = payload.letterNumber;
    }

    if (payload.data !== undefined) {
      const merged = { ...(letter.data as Record<string, unknown>), ...payload.data };
      update.data = merged;
      const templateRows = letter.templateId
        ? await db.select().from(letterTemplates).where(eq(letterTemplates.id, letter.templateId)).limit(1)
        : [];
      update.bodyText = payload.bodyText?.trim()
        ? payload.bodyText
        : renderTemplateText(templateRows[0]?.bodyTemplate ?? "", merged);
    } else if (payload.bodyText !== undefined) {
      update.bodyText = payload.bodyText;
    }

    const [updated] = await db.update(letters).set(update).where(eq(letters.id, letterId)).returning();

    if (letter.status === "revisi") {
      await db
        .update(letterRevisions)
        .set({ dataAfter: updated.data ?? {} })
        .where(and(eq(letterRevisions.letterId, letterId), eq(letterRevisions.status, "open")));
    }

    await logAudit({
      actor,
      action: "ubah_surat",
      entity: "letters",
      entityId: letterId,
      description: `Surat "${updated.title}" diperbarui (${Object.keys(update).join(", ")})`,
      metadata: { changes: Object.keys(update), status: updated.status },
    });

    return jsonOk({ item: updated });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const letterId = Number(id);
    const rows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
    const letter = rows[0];
    if (!letter) return jsonOk({ error: "Surat tidak ditemukan." }, 404);

    const isSuper = actor.roleCode === "super_admin";
    const canDelete =
      isSuper ||
      (actor.permissions.includes("surat.hapus") && (letter.status === "draft" || letter.senderId === actor.id));
    if (!canDelete) {
      return jsonOk({ error: "Anda tidak berhak menghapus surat ini." }, 403);
    }
    if (!isSuper && !["draft", "ditolak", "revisi"].includes(letter.status)) {
      return jsonOk({ error: "Surat yang sedang atau telah diproses tidak dapat dihapus." }, 400);
    }

    await db.delete(letterAttachments).where(eq(letterAttachments.letterId, letterId));
    await db.delete(letterRevisions).where(eq(letterRevisions.letterId, letterId));
    await db.delete(letterApprovals).where(eq(letterApprovals.letterId, letterId));
    await db.delete(letterArchives).where(eq(letterArchives.letterId, letterId));
    await db.delete(letters).where(eq(letters.id, letterId));

    await notify({
      userIds: [letter.senderId],
      type: "info",
      title: "Surat dihapus",
      message: `"${letter.title}" dihapus oleh ${actor.name}.`,
    });
    await logAudit({
      actor,
      action: "hapus_surat",
      entity: "letters",
      entityId: letterId,
      description: `Surat "${letter.title}" dihapus`,
      metadata: { status: letter.status },
    });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
