import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";
import { WorkflowError } from "@/lib/workflow";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown, fallbackStatus = 500) {
  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join(".") || "field"}: ${issue.message}`).join("; ");
    return NextResponse.json({ error: message || "Data tidak valid." }, { status: 400 });
  }
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof WorkflowError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Terjadi kesalahan pada server.";
  const status = message.includes("tidak diizinkan") || message.includes("melebihi batas") ? 400 : fallbackStatus;
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new WorkflowError("Body permintaan tidak valid (JSON diharapkan).", 400);
  }
}

export function parseList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function canAccessLetter(
  actor: { id: number; roleCode: string },
  letter: { senderId: number },
): boolean {
  if (actor.roleCode === "pembuat_surat") return letter.senderId === actor.id;
  return true;
}

/** Status surat yang masih boleh diubah pemiliknya (bukan admin). */
export const ATTACHMENT_EDITABLE_STATUSES = ["draft", "revisi", "ditolak"] as const;

/** Peran yang boleh mengurus lampiran pada status apa pun (mis. mengganti lampiran surat lama). */
const ATTACHMENT_ADMIN_ROLES = ["super_admin", "admin_persuratan"];

/**
 * Aturan tunggal untuk mengunggah & menghapus lampiran.
 *
 * Sebelumnya aturan unggah dan hapus berbeda sehingga admin bisa menambah
 * lampiran pada surat yang sudah disetujui tetapi tidak bisa menghapusnya —
 * akibatnya lampiran lama tidak bisa diganti. Sekarang keduanya memakai
 * aturan yang sama:
 *   - pembuat surat  → hanya saat Draft / Revisi / Ditolak
 *   - admin & super  → semua status (untuk perbaikan surat lama)
 */
export function canModifyAttachments(
  actor: { id: number; roleCode: string },
  letter: { senderId: number; status: string },
): boolean {
  if (ATTACHMENT_ADMIN_ROLES.includes(actor.roleCode)) return true;
  if (letter.senderId !== actor.id) return false;
  return (ATTACHMENT_EDITABLE_STATUSES as readonly string[]).includes(letter.status);
}

export function parseIntOrNull(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
