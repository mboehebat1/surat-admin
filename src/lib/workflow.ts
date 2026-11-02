import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  approvalSteps,
  approvalWorkflows,
  departments,
  letterArchives,
  letterApprovals,
  letterAttachments,
  letterCategories,
  letterRevisions,
  letterTemplates,
  letters,
  numberingSequences,
  templateFields,
  users,
  type Letter,
} from "@/db/schema";
import type { SessionUser } from "@/lib/auth";
import { logAudit, notify } from "@/lib/audit";
import { generateDocx, generatePdf, renderTemplateText, type LetterDocumentInput } from "@/lib/documents";
import { saveBuffer } from "@/lib/storage";
import { ROLE, ROLE_LABEL, ROMAN_MONTHS, type LetterStatus, titleCaseKey } from "@/lib/status";

export class WorkflowError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const pad = (value: number, length = 3) => String(value).padStart(length, "0");

/* ========================= PENOMORAN SURAT ========================= */

export type NumberingOptions = {
  categoryId?: number | null;
  departmentId?: number | null;
  format?: string | null;
  letterCode?: string | null;
  organizationCode?: string | null;
  date?: string | null;
};

export async function reserveLetterNumber(options: NumberingOptions): Promise<string> {
  const reference = options.date ? new Date(`${options.date}T00:00:00`) : new Date();
  const year = Number.isNaN(reference.getTime()) ? new Date().getFullYear() : reference.getFullYear();
  const monthIndex = Number.isNaN(reference.getTime()) ? new Date().getMonth() : reference.getMonth();
  const scopeKey = `cat:${options.categoryId ?? 0}|dept:${options.departmentId ?? 0}|year:${year}`;

  const sequence = await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(numberingSequences)
      .where(eq(numberingSequences.scopeKey, scopeKey))
      .limit(1);
    if (!existing[0]) {
      await tx.insert(numberingSequences).values({
        scopeKey,
        categoryId: options.categoryId ?? null,
        departmentId: options.departmentId ?? null,
        year,
        lastNumber: 0,
        format: options.format ?? null,
        letterCode: options.letterCode ?? null,
        organizationCode: options.organizationCode ?? null,
      });
    }
    const [updated] = await tx
      .update(numberingSequences)
      .set({
        lastNumber: sql`${numberingSequences.lastNumber} + 1`,
        format: options.format ?? undefined,
        letterCode: options.letterCode ?? undefined,
        organizationCode: options.organizationCode ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(numberingSequences.scopeKey, scopeKey))
      .returning();
    return updated;
  });

  const format =
    sequence?.format || options.format || "{nomor}/{kode}/{org}/{bulan}/{tahun}";
  const organizationCode = sequence?.organizationCode || options.organizationCode || "ESRT";
  const letterCode = sequence?.letterCode || options.letterCode || "HM";

  return format
    .replace(/\{nomor\}/g, pad(sequence?.lastNumber ?? 1))
    .replace(/\{nomor2\}/g, pad(sequence?.lastNumber ?? 1, 2))
    .replace(/\{kode\}/g, letterCode)
    .replace(/\{org\}/g, organizationCode)
    .replace(/\{bulan\}/g, ROMAN_MONTHS[monthIndex] ?? "I")
    .replace(/\{bulan_angka\}/g, pad(monthIndex + 1, 2))
    .replace(/\{tahun\}/g, String(year))
    .replace(/\{dept\}/g, options.departmentId ? String(options.departmentId) : "UMUM");
}



/* ======================= TEMPLATE & FIELD UTIL ====================== */

export function fieldLabelFromKey(key: string): string {
  const special: Record<string, string> = {
    nomor_surat: "Nomor Surat",
    tanggal_surat: "Tanggal Surat",
    nama_penerima: "Nama Penerima",
    jabatan_penerima: "Jabatan Penerima",
    alamat_penerima: "Alamat Penerima",
    alamat: "Alamat",
    perihal: "Perihal",
    isi_surat: "Isi Surat",
    nama_penandatangan: "Nama Penandatangan",
    jabatan_penandatangan: "Jabatan Penandatangan",
    lampiran: "Jumlah Lampiran",
    kop_surat: "Kop Surat",
  };
  return special[key] ?? titleCaseKey(key);
}

export function fieldTypeFromKey(key: string): string {
  if (key.includes("tanggal") || key.includes("date")) return "date";
  if (key.includes("isi") || key.includes("uraian") || key.includes("deskripsi") || key.includes("alamat"))
    return "textarea";
  if (key.includes("jumlah") || key.includes("nominal") || key.includes("angka")) return "number";
  if (key.includes("email") || key.includes("surel")) return "email";
  return "text";
}

export async function syncTemplateFields(
  templateId: number,
  detectedKeys: string[],
  bodyTemplate?: string | null,
) {
  const existing = await db
    .select()
    .from(templateFields)
    .where(eq(templateFields.templateId, templateId));
  const existingByKey = new Map(existing.map((f) => [f.key, f]));

  const order = [...detectedKeys];
  if (bodyTemplate) {
    const { extractPlaceholders } = await import("@/lib/documents");
    for (const key of extractPlaceholders(bodyTemplate)) {
      if (!order.includes(key)) order.push(key);
    }
  }

  let index = 0;
  for (const key of order) {
    const found = existingByKey.get(key);
    if (found) {
      await db
        .update(templateFields)
        .set({ sortOrder: index })
        .where(eq(templateFields.id, found.id));
      existingByKey.delete(key);
    } else {
      await db.insert(templateFields).values({
        templateId,
        key,
        label: fieldLabelFromKey(key),
        type: fieldTypeFromKey(key),
        isRequired: ["perihal", "isi_surat", "nama_penerima", "tanggal_surat"].includes(key),
        sortOrder: index,
        source: "detected",
        placeholder: `Isi ${fieldLabelFromKey(key)}`,
      });
    }
    index += 1;
  }
  for (const stale of existingByKey.values()) {
    await db.delete(templateFields).where(eq(templateFields.id, stale.id));
  }
  return order;
}

/* ========================= KONTEKS SURAT ============================ */

export type LetterContext = {
  letter: Letter;
  category: { id: number; name: string; code: string; defaultNumberFormat: string | null } | null;
  template: {
    id: number;
    name: string;
    bodyTemplate: string | null;
    docxPath: string | null;
    kopText: string | null;
    signerName: string | null;
    signerPosition: string | null;
    numberingFormat: string | null;
  } | null;
  fields: { key: string; label: string; type: string; options: unknown; isRequired: boolean }[];
  sender: { id: number; name: string; position: string | null; departmentName: string | null } | null;
  attachments: { id: number; originalName: string; storagePath: string; mimeType: string | null; sizeBytes: number }[];
  approvals: typeof letterApprovals.$inferSelect[];
};

export async function getLetterContext(letterId: number): Promise<LetterContext | null> {
  const letterRows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
  const letter = letterRows[0];
  if (!letter) return null;

  const categoryRows = await db
    .select()
    .from(letterCategories)
    .where(eq(letterCategories.id, letter.categoryId))
    .limit(1);
  const templateRows = letter.templateId
    ? await db.select().from(letterTemplates).where(eq(letterTemplates.id, letter.templateId)).limit(1)
    : [];
  const senderRows = await db
    .select({ user: users, department: departments })
    .from(users)
    .leftJoin(departments, eq(departments.id, users.departmentId))
    .where(eq(users.id, letter.senderId))
    .limit(1);
  const attachmentRows = await db
    .select()
    .from(letterAttachments)
    .where(eq(letterAttachments.letterId, letterId));
  const approvalRows = await db
    .select()
    .from(letterApprovals)
    .where(eq(letterApprovals.letterId, letterId))
    .orderBy(asc(letterApprovals.cycle), asc(letterApprovals.stepOrder));
  const fieldRows = letter.templateId
    ? await db
        .select()
        .from(templateFields)
        .where(eq(templateFields.templateId, letter.templateId))
        .orderBy(asc(templateFields.sortOrder))
    : [];

  return {
    letter,
    category: categoryRows[0] ?? null,
    template: templateRows[0] ?? null,
    fields: fieldRows,
    sender: senderRows[0]
      ? {
          id: senderRows[0].user.id,
          name: senderRows[0].user.name,
          position: senderRows[0].user.position,
          departmentName: senderRows[0].department?.name ?? null,
        }
      : null,
    attachments: attachmentRows,
    approvals: approvalRows,
  };
}

export async function buildDocumentInput(letterId: number): Promise<{
  input: LetterDocumentInput;
  templateDocxPath: string | null;
} | null> {
  const ctx = await getLetterContext(letterId);
  if (!ctx) return null;
  const { letter, template, sender, attachments, category } = ctx;
  const data = (letter.data ?? {}) as Record<string, unknown>;

  const input: LetterDocumentInput = {
    number: letter.letterNumber ?? "",
    date: letter.letterDate ?? new Date().toISOString().slice(0, 10),
    title: letter.title,
    recipientName: letter.recipientName ?? "",
    recipientPosition: letter.recipientPosition ?? "",
    recipientAddress: letter.recipientAddress ?? "",
    bodyText: letter.bodyText ?? renderTemplateText(template?.bodyTemplate ?? "", data),
    kopText:
      template?.kopText ??
      `PEMERINTAH / ORGANISASI\n${sender?.departmentName ?? "UNIT KERJA"}\nAlamat: Jl. Merdeka No. 1, Indonesia`,
    signerName: template?.signerName ?? (data.nama_penandatangan as string) ?? sender?.name ?? "",
    signerPosition:
      template?.signerPosition ?? (data.jabatan_penandatangan as string) ?? sender?.position ?? "",
    signerNip: null,
    senderName: sender?.name ?? "",
    senderPosition: sender?.position ?? "",
    classification: letter.classification,
    attachments: attachments.map((a) => a.originalName),
    data,
  };
  void category;
  return { input, templateDocxPath: template?.docxPath ?? null };
}

export async function generateLetterDocuments(letterId: number, actor: SessionUser | null) {
  const prepared = await buildDocumentInput(letterId);
  if (!prepared) throw new WorkflowError("Surat tidak ditemukan.", 404);

  const dir = `letters/${letterId}`;
  const baseName = `${(prepared.input.number || `surat-${letterId}`).replace(/[^\w.-]+/g, "_")}`;
  const docxBuffer = await generateDocx(prepared.input, prepared.templateDocxPath);
  const pdfBuffer = await generatePdf(prepared.input);

  const docx = await saveBuffer(dir, `${baseName}.docx`, docxBuffer);
  const pdf = await saveBuffer(dir, `${baseName}.pdf`, pdfBuffer);

  await db
    .update(letters)
    .set({ docxPath: docx.storagePath, pdfPath: pdf.storagePath, updatedAt: new Date() })
    .where(eq(letters.id, letterId));
  await db
    .update(letterArchives)
    .set({ docxPath: docx.storagePath, pdfPath: pdf.storagePath })
    .where(eq(letterArchives.letterId, letterId));

  await logAudit({
    actor,
    action: "generate_dokumen",
    entity: "letters",
    entityId: letterId,
    description: `Dokumen DOCX dan PDF dibuat untuk surat #${letterId}`,
    metadata: { docx: docx.storagePath, pdf: pdf.storagePath },
  });

  return { docx: docx.storagePath, pdf: pdf.storagePath };
}

/* ====================== ALUR PERSETUJUAN =========================== */

export async function resolveWorkflow(letter: Letter) {
  const candidates = await db
    .select()
    .from(approvalWorkflows)
    .where(eq(approvalWorkflows.isActive, true));

  const matched =
    candidates.find(
      (w) => w.categoryId === letter.categoryId && (!w.departmentId || w.departmentId === letter.departmentId),
    ) ??
    candidates.find((w) => w.categoryId === letter.categoryId) ??
    candidates.find((w) => w.isDefault) ??
    candidates[0];

  if (!matched) throw new WorkflowError("Belum ada alur persetujuan aktif. Hubungi administrator.", 400);

  const steps = await db
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.workflowId, matched.id))
    .orderBy(asc(approvalSteps.stepOrder));
  if (!steps.length) throw new WorkflowError("Alur persetujuan belum memiliki tahapan.", 400);
  return { workflow: matched, steps };
}

export function statusForRole(roleCode: string): LetterStatus {
  if (roleCode === ROLE.REVIEWER || roleCode === ROLE.ADMIN) return "menunggu_pemeriksaan";
  return "menunggu_persetujuan";
}

async function instantiateApprovals(letter: Letter, cycle: number) {
  const { workflow, steps } = await resolveWorkflow(letter);
  await db.delete(letterApprovals).where(and(eq(letterApprovals.letterId, letter.id), eq(letterApprovals.cycle, cycle), eq(letterApprovals.status, "waiting")));

  const now = new Date();
  await db.insert(letterApprovals).values(
    steps.map((step, index) => ({
      letterId: letter.id,
      cycle,
      stepOrder: step.stepOrder,
      label: step.label,
      roleCode: step.roleCode,
      status: index === 0 ? "pending" : "waiting",
      dueAt: new Date(now.getTime() + (step.slaHours ?? 24) * 3600 * 1000),
    })),
  );
  await db
    .update(letters)
    .set({
      workflowId: workflow.id,
      currentStep: 0,
      cycle,
      status: statusForRole(steps[0].roleCode),
      stageEnteredAt: now,
      updatedAt: now,
    })
    .where(eq(letters.id, letter.id));
  return { workflow, steps };
}

export async function submitLetter(letterId: number, actor: SessionUser) {
  const letterRows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
  const letter = letterRows[0];
  if (!letter) throw new WorkflowError("Surat tidak ditemukan.", 404);
  if (letter.senderId !== actor.id && actor.roleCode !== ROLE.SUPER_ADMIN && actor.roleCode !== ROLE.ADMIN) {
    throw new WorkflowError("Hanya pembuat surat yang dapat mengajukan surat ini.", 403);
  }
  if (!["draft", "revisi", "ditolak"].includes(letter.status)) {
    throw new WorkflowError(`Surat dengan status "${letter.status}" tidak dapat diajukan ulang.`, 400);
  }

  if (Object.keys((letter.data as Record<string, unknown>) ?? {}).length === 0 && !letter.bodyText) {
    throw new WorkflowError("Isi surat masih kosong. Lengkapi formulir sebelum mengajukan.", 400);
  }

  const cycle = letter.status === "draft" ? letter.cycle : letter.cycle + 1;
  const { steps } = await instantiateApprovals(letter, cycle);

  if (letter.status === "revisi" || letter.status === "ditolak") {
    await db
      .update(letterRevisions)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(and(eq(letterRevisions.letterId, letterId), eq(letterRevisions.status, "open")));
  }

  await db
    .update(letters)
    .set({
      submittedAt: letter.submittedAt ?? new Date(),
      rejectedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(letters.id, letterId));

  const targetRole = steps[0].roleCode;
  await notify({
    roleCodes: [targetRole, ROLE.ADMIN],
    type: "pengajuan",
    title: "Surat baru menunggu tindakan",
    message: `"${letter.title}" diajukan oleh ${actor.name} dan menunggu ${steps[0].label}.`,
    letterId,
    link: `/surat/${letterId}`,
  });
  await notify({
    userIds: [actor.id],
    type: "pengajuan",
    title: "Surat berhasil diajukan",
    message: `"${letter.title}" telah dikirim ke tahap ${steps[0].label}.`,
    letterId,
    link: `/surat/${letterId}`,
  });
  await logAudit({
    actor,
    action: "ajukan_surat",
    entity: "letters",
    entityId: letterId,
    description: `Surat diajukan ke tahap "${steps[0].label}" (siklus ${cycle})`,
    metadata: { cycle, step: steps[0].label },
  });

  return { status: statusForRole(targetRole), cycle };
}

async function currentPendingApproval(letterId: number, cycle: number) {
  const rows = await db
    .select()
    .from(letterApprovals)
    .where(
      and(
        eq(letterApprovals.letterId, letterId),
        eq(letterApprovals.cycle, cycle),
        eq(letterApprovals.status, "pending"),
      ),
    )
    .orderBy(asc(letterApprovals.stepOrder));
  return rows[0] ?? null;
}

function canActOnStep(actor: SessionUser, step: { roleCode: string }, letter: Letter): boolean {
  if (actor.roleCode === ROLE.SUPER_ADMIN) return true;
  if (actor.roleCode === ROLE.USER) return false;
  if (actor.roleCode !== step.roleCode) return false;
  if (step.roleCode === ROLE.USER) return letter.senderId === actor.id;
  return true;
}

export type LetterAction = "review" | "approve" | "reject" | "revision" | "distribute" | "archive";

export async function actOnLetter(
  letterId: number,
  actor: SessionUser,
  action: LetterAction,
  note?: string | null,
) {
  const letterRows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
  const letter = letterRows[0];
  if (!letter) throw new WorkflowError("Surat tidak ditemukan.", 404);

  const now = new Date();

  if (action === "distribute") {
    if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(actor.roleCode as never)) {
      throw new WorkflowError("Hanya Admin Persuratan yang dapat mendistribusikan surat.", 403);
    }
    if (!["disetujui", "selesai"].includes(letter.status)) {
      throw new WorkflowError("Surat harus berstatus Disetujui sebelum didistribusikan.", 400);
    }
    await db.update(letters).set({ status: "selesai", stageEnteredAt: now, updatedAt: now }).where(eq(letters.id, letterId));
    await notify({
      userIds: [letter.senderId],
      roleCodes: [ROLE.ADMIN],
      type: "selesai",
      title: "Surat selesai diproses",
      message: `"${letter.title}" (${letter.letterNumber ?? "-"}) telah didistribusikan.`,
      letterId,
      link: `/surat/${letterId}`,
    });
    await logAudit({
      actor,
      action: "distribusi_surat",
      entity: "letters",
      entityId: letterId,
      description: `Surat ${letter.letterNumber ?? `#${letterId}`} didistribusikan`,
    });
    return { status: "selesai" as LetterStatus };
  }

  if (action === "archive") {
    if (![ROLE.ADMIN, ROLE.SUPER_ADMIN].includes(actor.roleCode as never)) {
      throw new WorkflowError("Hanya Admin Persuratan yang dapat mengarsipkan surat.", 403);
    }
    if (!["selesai", "disetujui"].includes(letter.status)) {
      throw new WorkflowError("Surat harus berstatus Selesai sebelum diarsipkan.", 400);
    }
    await db
      .update(letters)
      .set({ status: "diarsipkan", archivedAt: now, stageEnteredAt: now, updatedAt: now })
      .where(eq(letters.id, letterId));
    await db.update(letterArchives).set({ archivedAt: now }).where(eq(letterArchives.letterId, letterId));
    await notify({
      userIds: [letter.senderId],
      type: "arsip",
      title: "Surat diarsipkan",
      message: `"${letter.title}" telah masuk arsip digital.`,
      letterId,
      link: `/arsip`,
    });
    await logAudit({
      actor,
      action: "arsipkan_surat",
      entity: "letters",
      entityId: letterId,
      description: `Surat ${letter.letterNumber ?? `#${letterId}`} diarsipkan`,
    });
    return { status: "diarsipkan" as LetterStatus };
  }

  const step = await currentPendingApproval(letterId, letter.cycle);
  if (!step) throw new WorkflowError("Tidak ada tahapan yang menunggu tindakan Anda.", 400);
  if (!canActOnStep(actor, step, letter)) {
    throw new WorkflowError(
      `Tahap ini adalah kewenangan ${ROLE_LABEL[step.roleCode] ?? step.roleCode}. Anda tidak berwenang.`,
      403,
    );
  }

  if (action === "review") {
    await db
      .update(letters)
      .set({ status: "dalam_pemeriksaan", stageEnteredAt: now, updatedAt: now })
      .where(eq(letters.id, letterId));
    await logAudit({
      actor,
      action: "mulai_pemeriksaan",
      entity: "letters",
      entityId: letterId,
      description: `${actor.name} mulai memeriksa "${letter.title}" pada tahap ${step.label}`,
    });
    return { status: "dalam_pemeriksaan" as LetterStatus };
  }

  if (action === "approve") {
    // Tahap pemeriksaan (admin/pemeriksa) memakai izin "surat.periksa",
    // tahap persetujuan (pejabat) memakai izin "surat.setujui".
    if (
      !actor.permissions.includes("surat.setujui") &&
      !actor.permissions.includes("surat.periksa") &&
      actor.roleCode !== ROLE.ADMIN
    ) {
      throw new WorkflowError("Anda tidak memiliki izin persetujuan pada tahap ini.", 403);
    }
    await db
      .update(letterApprovals)
      .set({ status: "approved", approverId: actor.id, note: note ?? "Disetujui tanpa catatan.", actedAt: now })
      .where(eq(letterApprovals.id, step.id));

    const siblings = await db
      .select()
      .from(letterApprovals)
      .where(and(eq(letterApprovals.letterId, letterId), eq(letterApprovals.cycle, letter.cycle)))
      .orderBy(asc(letterApprovals.stepOrder));
    const next = siblings.find((s) => s.status === "waiting");

    if (next) {
      await db.update(letterApprovals).set({ status: "pending" }).where(eq(letterApprovals.id, next.id));
      const nextStatus = statusForRole(next.roleCode);
      await db
        .update(letters)
        .set({ currentStep: next.stepOrder, status: nextStatus, stageEnteredAt: now, updatedAt: now })
        .where(eq(letters.id, letterId));
      await notify({
        roleCodes: [next.roleCode],
        type: nextStatus === "menunggu_persetujuan" ? "persetujuan" : "pemeriksaan",
        title: nextStatus === "menunggu_persetujuan" ? "Surat menunggu persetujuan" : "Surat menunggu pemeriksaan",
        message: `"${letter.title}" lolos tahap ${step.label} dan kini menunggu ${next.label}.`,
        letterId,
        link: `/surat/${letterId}`,
      });
      await notify({
        userIds: [letter.senderId],
        type: "progres",
        title: "Tahap persetujuan berjalan",
        message: `"${letter.title}" disetujui pada tahap ${step.label}.`,
        letterId,
        link: `/surat/${letterId}`,
      });
      await logAudit({
        actor,
        action: "setujui_tahap",
        entity: "letters",
        entityId: letterId,
        description: `${step.label} disetujui oleh ${actor.name}; diteruskan ke ${next.label}`,
        metadata: { stepId: step.id, note: note ?? null, cycle: letter.cycle },
      });
      return { status: nextStatus };
    }

    // Tahap terakhir: berikan nomor, buat dokumen, dan arsipkan.
    const ctx = await getLetterContext(letterId);
    const number = await reserveLetterNumber({
      categoryId: letter.categoryId,
      departmentId: letter.departmentId,
      format:
        ctx?.template?.numberingFormat ??
        ctx?.category?.defaultNumberFormat ??
        "{nomor}/{kode}/{org}/{bulan}/{tahun}",
      letterCode: ctx?.category?.code ?? "HM",
      organizationCode: "ESRT",
      date: letter.letterDate,
    });

    await db
      .update(letters)
      .set({
        letterNumber: number,
        status: "disetujui",
        approvedAt: now,
        completedAt: now,
        currentStep: step.stepOrder,
        stageEnteredAt: now,
        updatedAt: now,
      })
      .where(eq(letters.id, letterId));

    const existingArchive = await db
      .select()
      .from(letterArchives)
      .where(eq(letterArchives.letterId, letterId))
      .limit(1);
    const archiveYear = Number(letter.letterDate?.slice(0, 4) ?? now.getFullYear());
    if (!existingArchive[0]) {
      await db.insert(letterArchives).values({
        letterId,
        archiveNumber: `ARS/${archiveYear}/${pad(letterId, 4)}`,
        archiveCategory: ctx?.category?.name ?? "Umum",
        year: archiveYear,
        description: letter.title,
        location: `storage/letters/${letterId}`,
        archivedBy: actor.id,
        archivedAt: now,
      });
    }

    try {
      await generateLetterDocuments(letterId, actor);
    } catch (error) {
      await logAudit({
        actor,
        action: "generate_dokumen_gagal",
        entity: "letters",
        entityId: letterId,
        description: `Pembuatan dokumen gagal: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }

    await notify({
      userIds: [letter.senderId],
      roleCodes: [ROLE.ADMIN],
      type: "disetujui",
      title: "Surat disetujui",
      message: `"${letter.title}" disetujui dengan nomor ${number}. Dokumen siap diunduh.`,
      letterId,
      link: `/surat/${letterId}`,
    });
    await logAudit({
      actor,
      action: "persetujuan_final",
      entity: "letters",
      entityId: letterId,
      description: `Persetujuan digital oleh ${actor.name} (${actor.roleName}) — nomor surat ${number}`,
      metadata: { stepId: step.id, note: note ?? null, cycle: letter.cycle, approvedAt: now.toISOString() },
    });
    return { status: "disetujui" as LetterStatus, letterNumber: number };
  }

  if (action === "reject") {
    if (!note || note.trim().length < 5) throw new WorkflowError("Alasan penolakan wajib diisi (min. 5 karakter).", 400);
    if (
      !actor.permissions.includes("surat.tolak") &&
      !actor.permissions.includes("surat.periksa") &&
      actor.roleCode !== ROLE.ADMIN
    ) {
      throw new WorkflowError("Anda tidak memiliki izin penolakan pada tahap ini.", 403);
    }
    await db
      .update(letterApprovals)
      .set({ status: "rejected", approverId: actor.id, note, actedAt: now })
      .where(eq(letterApprovals.id, step.id));
    await db
      .update(letters)
      .set({ status: "ditolak", rejectedReason: note, stageEnteredAt: now, updatedAt: now })
      .where(eq(letters.id, letterId));
    await notify({
      userIds: [letter.senderId],
      roleCodes: [ROLE.ADMIN],
      type: "ditolak",
      title: "Surat ditolak",
      message: `"${letter.title}" ditolak pada tahap ${step.label}. Alasan: ${note}`,
      letterId,
      link: `/surat/${letterId}`,
    });
    await logAudit({
      actor,
      action: "tolak_surat",
      entity: "letters",
      entityId: letterId,
      description: `Surat ditolak oleh ${actor.name} pada tahap ${step.label}`,
      metadata: { note, cycle: letter.cycle },
    });
    return { status: "ditolak" as LetterStatus };
  }

  if (action === "revision") {
    if (!note || note.trim().length < 5) throw new WorkflowError("Catatan revisi wajib diisi (min. 5 karakter).", 400);
    const openRevisions = await db
      .select()
      .from(letterRevisions)
      .where(and(eq(letterRevisions.letterId, letterId), eq(letterRevisions.status, "open")));
    await db
      .update(letterApprovals)
      .set({ status: "revision", approverId: actor.id, note, actedAt: now })
      .where(eq(letterApprovals.id, step.id));
    await db.insert(letterRevisions).values({
      letterId,
      cycle: letter.cycle,
      revisionNumber: openRevisions.length + letter.revisionCount + 1,
      requestedBy: actor.id,
      requestedRole: actor.roleCode,
      note,
      dataBefore: letter.data ?? {},
      status: "open",
    });
    await db
      .update(letters)
      .set({
        status: "revisi",
        revisionCount: letter.revisionCount + 1,
        stageEnteredAt: now,
        updatedAt: now,
      })
      .where(eq(letters.id, letterId));
    await notify({
      userIds: [letter.senderId],
      type: "revisi",
      title: "Surat dikembalikan untuk revisi",
      message: `"${letter.title}" perlu diperbaiki. Catatan: ${note}`,
      letterId,
      link: `/surat/${letterId}/edit`,
    });
    await logAudit({
      actor,
      action: "minta_revisi",
      entity: "letters",
      entityId: letterId,
      description: `Revisi diminta oleh ${actor.name} pada tahap ${step.label}`,
      metadata: { note, cycle: letter.cycle },
    });
    return { status: "revisi" as LetterStatus };
  }

  throw new WorkflowError("Tindakan tidak dikenal.", 400);
}

/* ============================ UTIL LAIN ============================= */

export async function listPendingForUser(actor: SessionUser) {
  const rows = await db
    .select({ approval: letterApprovals, letter: letters })
    .from(letterApprovals)
    .innerJoin(letters, eq(letters.id, letterApprovals.letterId))
    .where(
      and(
        eq(letterApprovals.status, "pending"),
        inArray(letterApprovals.roleCode, [actor.roleCode, ROLE.SUPER_ADMIN].filter(Boolean) as string[]),
      ),
    )
    .orderBy(desc(letterApprovals.createdAt));
  return rows;
}

export async function touchLetterUpdatedAt(letterId: number) {
  await db.update(letters).set({ updatedAt: new Date() }).where(eq(letters.id, letterId));
}
