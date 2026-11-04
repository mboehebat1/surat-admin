"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  RefreshCw,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  FileText,
  Paperclip,
  PenLine,
  Printer,
  RotateCcw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Textarea, Table, TBody, TD, TH, THead, TR, cn, useToast } from "@/components/ui";
import { LetterPreview } from "@/components/letter-preview";
import { StatusPill } from "@/components/letter-table";
import { ACTION_META, ROLE_LABEL, durationLabel, formatBytes, formatDateID, formatDateTimeID } from "@/lib/status";

export type ApprovalDto = {
  id: number;
  cycle: number;
  stepOrder: number;
  label: string;
  roleCode: string;
  approverName: string | null;
  approverRoleLabel: string;
  status: string;
  note: string | null;
  actedAt: string | null;
  dueAt: string | null;
  createdAt: string;
};

export type LetterDetailDto = {
  letter: {
    id: number;
    title: string;
    letterNumber: string | null;
    agendaNumber: string | null;
    status: string;
    categoryId: number;
    categoryName: string | null;
    templateName: string | null;
    senderId: number;
    senderName: string | null;
    departmentName: string | null;
    recipientName: string | null;
    recipientPosition: string | null;
    recipientAddress: string | null;
    letterDate: string | null;
    classification: string;
    priority: string;
    cycle: number;
    revisionCount: number;
    rejectedReason: string | null;
    bodyText: string | null;
    data: Record<string, string>;
    submittedAt: string | null;
    approvedAt: string | null;
    completedAt: string | null;
    archivedAt: string | null;
    stageEnteredAt: string | null;
    stageDurationMs: number;
    currentStepLabel: string | null;
    currentApproverRole: string | null;
    archived: boolean;
    createdAt: string;
    updatedAt: string;
  };
  template: {
    name: string;
    bodyTemplate: string | null;
    kopText: string | null;
    signerName: string | null;
    signerPosition: string | null;
    numberingFormat: string | null;
  } | null;
  sender: { name: string; email: string; position: string | null } | null;
  attachments: { id: number; originalName: string; sizeBytes: number; mimeType: string | null; createdAt: string }[];
  approvals: ApprovalDto[];
  revisions: {
    id: number;
    cycle: number;
    revisionNumber: number;
    note: string;
    status: string;
    requestedRole: string | null;
    requesterName: string | null;
    createdAt: string;
    resolvedAt: string | null;
  }[];
  archive: { archiveNumber: string | null; archivedAt: string; year: number; location: string | null } | null;
  history: { id: number; action: string; description: string | null; userName: string | null; createdAt: string }[];
};

type Actor = { id: number; roleCode: string; permissions: string[] };

export function LetterDetailView({ detail, actor }: { detail: LetterDetailDto; actor: Actor }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "approve" | "reject" | "revision">(null);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"dokumen" | "lampiran" | "data" | "riwayat">("dokumen");

  const letter = detail.letter;
  const currentApproval = detail.approvals.find((a) => a.status === "pending" && a.cycle === letter.cycle) ?? null;
  const isOwner = letter.senderId === actor.id;
  const isSuper = actor.roleCode === "super_admin";
  const isAdmin = actor.roleCode === "admin_persuratan";
  const canAct =
    currentApproval !== null &&
    (isSuper || (currentApproval.roleCode === actor.roleCode && actor.roleCode !== "pembuat_surat"));
  const canEdit = ["draft", "revisi", "ditolak"].includes(letter.status) && (isOwner || isAdmin || isSuper);

  const run = async (action: string, payload?: { note?: string }) => {
    setBusy(action);
    const result = await api(`/api/letters/${letter.id}/action`, {
      method: "POST",
      body: { action, note: payload?.note ?? null },
    });
    setBusy(null);
    if (!result.ok) {
      toast.push("error", result.error);
      return false;
    }
    const messages: Record<string, string> = {
      submit: "Surat berhasil diajukan ke tahap berikutnya.",
      review: "Pemeriksaan dimulai. Status surat diperbarui.",
      approve: "Tindakan persetujuan tercatat.",
      reject: "Surat ditolak dan pembuat telah dinotifikasi.",
      revision: "Catatan revisi dikirim ke pembuat surat.",
      distribute: "Surat didistribusikan dan berstatus Selesai.",
      archive: "Surat masuk ke arsip digital.",
    };
    toast.push("success", messages[action] ?? "Tindakan berhasil.");
    setModal(null);
    setNote("");
    router.refresh();
    return true;
  };

  const removeLetter = async () => {
    setBusy("delete");
    const result = await api(`/api/letters/${letter.id}`, { method: "DELETE" });
    setBusy(null);
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    toast.push("success", "Surat dihapus.");
    router.push("/surat");
    router.refresh();
  };

  const duplicateLetter = async () => {
    setBusy("duplicate");
    const result = await api<{ item: { id: number } }>(`/api/letters/${letter.id}/duplicate`, { method: "POST" });
    setBusy(null);
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    toast.push("success", `Salinan draft dibuat (#${result.data.item.id}).`);
    router.push(`/surat/${result.data.item.id}/edit`);
  };

  const cycles = Array.from(new Set(detail.approvals.map((a) => a.cycle))).sort((a, b) => b - a);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={letter.status} />
            {letter.letterNumber ? (
              <Badge className="bg-navy-50 font-mono text-navy-800 ring-navy-200">{letter.letterNumber}</Badge>
            ) : (
              <Badge>Nomor menunggu persetujuan akhir</Badge>
            )}
            {letter.priority !== "normal" ? (
              <Badge className="bg-amber-50 text-amber-700 ring-amber-300">Prioritas {letter.priority}</Badge>
            ) : null}
            <Badge className="bg-slate-100 text-slate-600 ring-slate-200">Klasifikasi: {letter.classification}</Badge>
            {letter.cycle > 1 ? <Badge className="bg-blue-50 text-blue-700 ring-blue-300">Siklus ke-{letter.cycle}</Badge> : null}
          </div>
          <h1 className="mt-2 text-xl font-semibold leading-snug text-slate-900">{letter.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            #{letter.id} · {letter.categoryName ?? "Tanpa kategori"} · dibuat {formatDateTimeID(letter.createdAt)} oleh {letter.senderName}
            {letter.departmentName ? ` (${letter.departmentName})` : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit ? (
            <Link href={`/surat/${letter.id}/edit`}>
              <Button variant="outline" size="sm" icon={<PenLine className="h-3.5 w-3.5" />}>
                Perbaiki Surat
              </Button>
            </Link>
          ) : null}
          {["draft", "revisi", "ditolak"].includes(letter.status) && (isOwner || isAdmin || isSuper) ? (
            <Button size="sm" loading={busy === "submit"} icon={<Send className="h-3.5 w-3.5" />} onClick={() => run("submit")}>
              Ajukan Surat
            </Button>
          ) : null}
          {canAct && letter.status === "menunggu_pemeriksaan" ? (
            <Button variant="secondary" size="sm" loading={busy === "review"} icon={<Eye className="h-3.5 w-3.5" />} onClick={() => run("review")}>
              Mulai Periksa
            </Button>
          ) : null}
          {canAct ? (
            <>
              <Button variant="success" size="sm" loading={busy === "approve"} icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setModal("approve")}>
                Setujui
              </Button>
              <Button variant="warning" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setModal("revision")}>
                Minta Revisi
              </Button>
              <Button variant="danger" size="sm" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setModal("reject")}>
                Tolak
              </Button>
            </>
          ) : null}
          {letter.status === "disetujui" && (isAdmin || isSuper) ? (
            <Button size="sm" loading={busy === "distribute"} icon={<Send className="h-3.5 w-3.5" />} onClick={() => run("distribute")}>
              Distribusikan
            </Button>
          ) : null}
          {letter.status === "selesai" && (isAdmin || isSuper) ? (
            <Button variant="success" size="sm" loading={busy === "archive"} icon={<Archive className="h-3.5 w-3.5" />} onClick={() => run("archive")}>
              Arsipkan
            </Button>
          ) : null}
          <a href={`/api/letters/${letter.id}/download?format=pdf&inline=1`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
              PDF
            </Button>
          </a>
          <a href={`/api/letters/${letter.id}/download?format=docx`}>
            <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
              DOCX
            </Button>
          </a>
          <a
            href={`/api/letters/${letter.id}/download?format=pdf&fresh=1&inline=1`}
            target="_blank"
            rel="noreferrer"
            title="Bentuk ulang dokumen dari template terbaru tanpa watermark"
          >
            <Button variant="ghost" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />}>
              Bentuk ulang
            </Button>
          </a>
          <Button variant="outline" size="sm" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
            Cetak
          </Button>
          <Button variant="ghost" size="sm" loading={busy === "duplicate"} icon={<Copy className="h-3.5 w-3.5" />} onClick={duplicateLetter}>
            Duplikasi
          </Button>
          {(isSuper || (letter.status === "draft" && isOwner)) && actor.permissions.includes("surat.hapus") ? (
            <Button variant="ghost" size="sm" loading={busy === "delete"} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={removeLetter} className="text-red-600 hover:bg-red-50">
              Hapus
            </Button>
          ) : null}
        </div>
      </div>

      {letter.rejectedReason ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <div>
            <p className="text-xs font-semibold text-red-800">Alasan penolakan</p>
            <p className="mt-0.5 text-xs text-red-700">{letter.rejectedReason}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 px-3 py-2">
              {[
                { key: "dokumen", label: "Dokumen Surat", icon: FileText },
                { key: "lampiran", label: `Lampiran (${detail.attachments.length})`, icon: Paperclip },
                { key: "data", label: "Data Formulir", icon: ClipboardCheck },
                { key: "riwayat", label: "Riwayat Audit", icon: Eye },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key as typeof tab)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    tab === item.key ? "bg-navy-900 text-white" : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "dokumen" ? (
              <div className="bg-slate-50 p-4">
                <LetterPreview
                  data={{
                    kopText: detail.template?.kopText,
                    number: letter.letterNumber,
                    date: letter.letterDate,
                    title: letter.title,
                    recipientName: letter.recipientName,
                    recipientPosition: letter.recipientPosition,
                    recipientAddress: letter.recipientAddress,
                    bodyText: letter.bodyText,
                    signerName: detail.template?.signerName ?? detail.sender?.name,
                    signerPosition: detail.template?.signerPosition ?? detail.sender?.position,
                    classification: letter.classification,
                    attachments: detail.attachments,
                    letterId: letter.id,
                    ready: ["disetujui", "selesai", "diarsipkan"].includes(letter.status),
                  }}
                />
              </div>
            ) : null}

            {tab === "lampiran" ? (
              detail.attachments.length === 0 ? (
                <EmptyState icon={<Paperclip className="h-6 w-6" />} title="Tidak ada lampiran" description="Dokumen pendukung yang diunggah pembuat surat akan tampil di sini." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {detail.attachments.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <FileText className="h-4 w-4 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-800">{item.originalName}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatBytes(item.sizeBytes)} · {item.mimeType ?? "unknown"} · diunggah {formatDateTimeID(item.createdAt)}
                        </p>
                      </div>
                      <a href={`/api/letters/${letter.id}/attachments/${item.id}?download=1`} target="_blank" rel="noreferrer">
                        <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
                          Unduh
                        </Button>
                      </a>
                      <a href={`/api/letters/${letter.id}/attachments/${item.id}`} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" icon={<Eye className="h-3.5 w-3.5" />}>
                          Lihat
                        </Button>
                      </a>
                    </li>
                  ))}
                </ul>
              )
            ) : null}

            {tab === "data" ? (
              <Table>
                <THead>
                  <tr>
                    <TH>Field</TH>
                    <TH>Nilai</TH>
                  </tr>
                </THead>
                <TBody>
                  {Object.entries(letter.data ?? {}).length === 0 ? (
                    <TR>
                      <TD className="text-xs text-slate-400" >
                        Tidak ada data formulir.
                      </TD>
                      <TD />
                    </TR>
                  ) : (
                    Object.entries(letter.data ?? {}).map(([key, value]) => (
                      <TR key={key}>
                        <TD className="font-mono text-[11px] text-slate-500">{`{{${key}}}`}</TD>
                        <TD className="whitespace-pre-wrap text-xs text-slate-700">{String(value ?? "-")}</TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            ) : null}

            {tab === "riwayat" ? (
              detail.history.length === 0 ? (
                <EmptyState title="Belum ada aktivitas tercatat" />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {detail.history.map((item) => (
                    <li key={item.id} className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{item.action}</Badge>
                        <span className="text-[11px] text-slate-400">{formatDateTimeID(item.createdAt)}</span>
                        <span className="text-[11px] text-slate-500">oleh {item.userName}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                    </li>
                  ))}
                </ul>
              )
            ) : null}
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Informasi Surat" />
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 p-4 text-xs sm:grid-cols-2">
              {[
                ["Jenis surat", letter.categoryName ?? "-"],
                ["Template", letter.templateName ?? "-"],
                ["Pembuat", letter.senderName ?? "-"],
                ["Departemen", letter.departmentName ?? "-"],
                ["Tanggal surat", formatDateID(letter.letterDate)],
                ["Diajukan", letter.submittedAt ? formatDateTimeID(letter.submittedAt) : "-"],
                ["Disetujui", letter.approvedAt ? formatDateTimeID(letter.approvedAt) : "-"],
                ["Diarsipkan", letter.archivedAt ? formatDateTimeID(letter.archivedAt) : "-"],
                ["Tahap sekarang", letter.currentStepLabel ?? "-"],
                ["Menunggu di", letter.currentApproverRole ? ROLE_LABEL[letter.currentApproverRole] ?? "-" : "-"],
                ["Lama di tahap ini", durationLabel(letter.stageDurationMs)],
                ["Jumlah revisi", `${letter.revisionCount}×`],
              ].map(([label, value]) => (
                <div key={label} className="flex flex-col">
                  <dt className="text-[11px] text-slate-400">{label}</dt>
                  <dd className="font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Alur Persetujuan" subtitle={`Siklus berjalan: ke-${letter.cycle}`} icon={<ClipboardCheck className="h-4 w-4" />} />
            <div className="space-y-4 p-4">
              {cycles.map((cycle) => (
                <div key={cycle}>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Siklus {cycle}
                    {cycle < letter.cycle ? " (riwayat)" : " (aktif)"}
                  </p>
                  <ol className="space-y-2">
                    {detail.approvals
                      .filter((a) => a.cycle === cycle)
                      .sort((a, b) => a.stepOrder - b.stepOrder)
                      .map((item) => {
                        const meta = ACTION_META[item.status] ?? ACTION_META.waiting;
                        return (
                          <li key={item.id} className="rounded-lg border border-slate-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="text-xs font-semibold text-slate-800">
                                  {item.stepOrder}. {item.label}
                                </p>
                                <p className="mt-0.5 text-[11px] text-slate-500">
                                  {item.approverRoleLabel}
                                  {item.approverName ? ` · ${item.approverName}` : ""}
                                </p>
                              </div>
                              <Badge className={meta.badge}>{meta.label}</Badge>
                            </div>
                            {item.note ? (
                              <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-600">
                                “{item.note}”
                              </p>
                            ) : null}
                            <p className="mt-1.5 text-[10px] text-slate-400">
                              {item.actedAt
                                ? `Bertindak ${formatDateTimeID(item.actedAt)}`
                                : item.status === "pending"
                                  ? `Menunggu sejak ${formatDateTimeID(item.createdAt)}${item.dueAt ? ` · SLA ${formatDateTimeID(item.dueAt)}` : ""}`
                                  : "Belum mendapat giliran"}
                            </p>
                          </li>
                        );
                      })}
                  </ol>
                </div>
              ))}
            </div>
          </Card>

          {detail.revisions.length ? (
            <Card>
              <CardHeader title="Catatan Revisi" icon={<RotateCcw className="h-4 w-4" />} />
              <ul className="divide-y divide-slate-100">
                {detail.revisions.map((item) => (
                  <li key={item.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">
                        Revisi #{item.revisionNumber} · siklus {item.cycle}
                      </p>
                      <Badge className={item.status === "resolved" ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : "bg-amber-50 text-amber-700 ring-amber-300"}>
                        {item.status === "resolved" ? "Selesai" : "Menunggu perbaikan"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{item.note}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {item.requesterName ?? "Sistem"} ({ROLE_LABEL[item.requestedRole ?? ""] ?? item.requestedRole}) ·{" "}
                      {formatDateTimeID(item.createdAt)}
                      {item.resolvedAt ? ` · diselesaikan ${formatDateTimeID(item.resolvedAt)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {detail.archive ? (
            <Card>
              <CardHeader title="Data Arsip" icon={<Archive className="h-4 w-4" />} />
              <dl className="grid grid-cols-2 gap-3 p-4 text-xs">
                <div>
                  <dt className="text-[11px] text-slate-400">Nomor arsip</dt>
                  <dd className="font-mono font-medium text-slate-800">{detail.archive.archiveNumber ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] text-slate-400">Tahun</dt>
                  <dd className="font-medium text-slate-800">{detail.archive.year}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-slate-400">Lokasi penyimpanan</dt>
                  <dd className="break-all font-mono text-[11px] text-slate-700">{detail.archive.location ?? "-"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] text-slate-400">Diarsipkan</dt>
                  <dd className="font-medium text-slate-800">{formatDateTimeID(detail.archive.archivedAt)}</dd>
                </div>
              </dl>
            </Card>
          ) : null}
        </div>
      </div>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal === "approve" ? "Setujui surat" : modal === "reject" ? "Tolak surat" : "Kembalikan untuk revisi"}
        description={
          modal === "approve"
            ? `Persetujuan digital akan dicatat atas nama ${actor.roleCode === "super_admin" ? "Super Admin" : ROLE_LABEL[actor.roleCode] ?? actor.roleCode} lengkap dengan waktu dan jejak audit.`
            : "Tuliskan catatan yang jelas agar pembuat surat dapat menindaklanjuti."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>
              Batal
            </Button>
            <Button
              variant={modal === "approve" ? "success" : modal === "reject" ? "danger" : "warning"}
              loading={busy === modal}
              onClick={() => {
                if (!modal) return;
                if ((modal === "reject" || modal === "revision") && note.trim().length < 5) {
                  toast.push("error", "Catatan wajib diisi minimal 5 karakter.");
                  return;
                }
                void run(modal, { note: note.trim() || undefined });
              }}
            >
              {modal === "approve" ? "Ya, setujui" : modal === "reject" ? "Tolak surat" : "Kirim catatan revisi"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-800">{letter.title}</p>
            <p className="mt-0.5">
              {letter.letterNumber ?? "#"}{letter.id} · tahap {currentApproval?.label ?? "-"}
            </p>
          </div>
          <Textarea
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              modal === "approve"
                ? "Catatan persetujuan (opsional)"
                : modal === "reject"
                  ? "Alasan penolakan (wajib)"
                  : "Catatan perbaikan yang harus dilakukan pembuat surat (wajib)"
            }
          />
          {modal === "reject" ? (
            <p className="text-[11px] text-red-600">
              Penolakan bersifat final untuk siklus ini. Pembuat surat dapat memperbaiki dan mengajukan ulang sebagai
              siklus baru tanpa menghapus riwayat.
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
