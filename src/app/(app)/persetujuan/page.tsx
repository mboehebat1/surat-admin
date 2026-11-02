"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, ExternalLink, RotateCcw, XCircle } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, EmptyState, LoadingRows, Modal, Textarea, useToast } from "@/components/ui";
import { StatusPill } from "@/components/letter-table";
import { ROLE_LABEL, durationLabel, formatDateID, formatDateTimeID } from "@/lib/status";

type QueueItem = {
  id: number;
  title: string;
  letterNumber: string | null;
  status: string;
  categoryName: string | null;
  senderName: string | null;
  departmentName: string | null;
  letterDate: string | null;
  currentStepLabel: string | null;
  currentApproverRoleLabel: string | null;
  stageDurationMs: number;
  priority: string;
  submittedAt: string | null;
  revisionCount: number;
};

export default function ApprovalPage() {
  const toast = useToast();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<{ item: QueueItem; action: "approve" | "reject" | "revision"; label: string } | null>(null);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api<{ rows: QueueItem[]; total: number }>("/api/letters?scope=pending&limit=100");
    if (result.ok) setItems(result.data.rows);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (item: QueueItem, action: "approve" | "reject" | "revision" | "review", noteValue?: string) => {
    setBusy(`${item.id}-${action}`);
    const result = await api(`/api/letters/${item.id}/action`, { method: "POST", body: { action, note: noteValue ?? null } });
    setBusy(null);
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    toast.push("success", action === "approve" ? "Surat disetujui dan diteruskan." : action === "reject" ? "Surat ditolak." : action === "revision" ? "Catatan revisi dikirim." : "Pemeriksaan dimulai.");
    setModal(null);
    setNote("");
    void load();
  };

  const grouped = {
    menunggu: items.filter((i) => ["menunggu_pemeriksaan", "menunggu_persetujuan"].includes(i.status)),
    proses: items.filter((i) => ["dalam_pemeriksaan", "diajukan"].includes(i.status)),
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Persetujuan &amp; Pemeriksaan Surat</h1>
        <p className="mt-1 text-sm text-slate-500">
          Daftar surat yang menunggu tindakan sesuai kewenangan peran Anda. Setiap keputusan dicatat dengan identitas,
          waktu, dan jejak audit.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Menunggu tindakan</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{grouped.menunggu.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Sedang Anda periksa</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{grouped.proses.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Melewati SLA (&gt;2 hari)</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">
            {items.filter((i) => i.stageDurationMs > 2 * 86400000).length}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Antrean persetujuan"
          subtitle={`${items.length} surat menunggu keputusan`}
          icon={<ClipboardCheck className="h-4 w-4" />}
          action={
            <Button variant="outline" size="sm" onClick={() => void load()}>
              Segarkan
            </Button>
          }
        />
        {loading ? (
          <LoadingRows rows={5} />
        ) : error ? (
          <EmptyState title="Gagal memuat data" description={error} action={<Button size="sm" onClick={() => void load()}>Coba lagi</Button>} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />}
            title="Tidak ada surat menunggu"
            description="Semua tahapan persetujuan telah diselesaikan."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                <div className="min-w-[240px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={item.status} />
                    <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{item.categoryName ?? "-"}</Badge>
                    {item.priority !== "normal" ? (
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-300">{item.priority}</Badge>
                    ) : null}
                    {item.stageDurationMs > 2 * 86400000 ? (
                      <Badge className="bg-red-50 text-red-700 ring-red-300">terlambat {durationLabel(item.stageDurationMs)}</Badge>
                    ) : null}
                  </div>
                  <Link href={`/surat/${item.id}`} className="mt-1.5 block text-sm font-semibold text-slate-900 hover:text-navy-700">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-[11px] text-slate-500">
                    #{item.id} · {item.letterNumber ?? "nomor menyusul"} · pembuat {item.senderName ?? "-"}
                    {item.departmentName ? ` (${item.departmentName})` : ""} · tanggal surat {formatDateID(item.letterDate)}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Tahap: <span className="font-medium text-slate-700">{item.currentStepLabel ?? "-"}</span> · diajukan{" "}
                    {item.submittedAt ? formatDateTimeID(item.submittedAt) : "-"} · menunggu {durationLabel(item.stageDurationMs)}
                  </p>
                  {item.revisionCount > 0 ? (
                    <p className="mt-1 text-[11px] text-amber-600">Surat ini pernah direvisi {item.revisionCount}×.</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {item.status === "menunggu_pemeriksaan" ? (
                    <Button variant="secondary" size="sm" loading={busy === `${item.id}-review`} icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={() => act(item, "review")}>
                      Mulai periksa
                    </Button>
                  ) : null}
                  <Button variant="success" size="sm" loading={busy === `${item.id}-approve`} icon={<CheckCircle2 className="h-3.5 w-3.5" />} onClick={() => setModal({ item, action: "approve", label: item.currentStepLabel ?? "tahap ini" })}>
                    Setujui
                  </Button>
                  <Button variant="warning" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => setModal({ item, action: "revision", label: item.currentStepLabel ?? "tahap ini" })}>
                    Revisi
                  </Button>
                  <Button variant="danger" size="sm" icon={<XCircle className="h-3.5 w-3.5" />} onClick={() => setModal({ item, action: "reject", label: item.currentStepLabel ?? "tahap ini" })}>
                    Tolak
                  </Button>
                  <Link href={`/surat/${item.id}`}>
                    <Button variant="ghost" size="sm">
                      Detail
                    </Button>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.action === "approve" ? "Setujui surat" : modal?.action === "reject" ? "Tolak surat" : "Kembalikan untuk revisi"}
        description={modal ? `Tahap: ${modal.label} — kewenangan ${ROLE_LABEL[modal.item.currentApproverRoleLabel ?? ""] ?? "Anda"}` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setModal(null)}>Batal</Button>
            <Button
              variant={modal?.action === "approve" ? "success" : modal?.action === "reject" ? "danger" : "warning"}
              loading={modal ? busy === `${modal.item.id}-${modal.action}` : false}
              onClick={() => {
                if (!modal) return;
                if (modal.action !== "approve" && note.trim().length < 5) {
                  toast.push("error", "Catatan wajib diisi minimal 5 karakter.");
                  return;
                }
                void act(modal.item, modal.action, note.trim() || undefined);
              }}
            >
              Konfirmasi
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs font-semibold text-slate-800">{modal?.item.title}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Pembuat: {modal?.item.senderName} · diajukan {modal?.item.submittedAt ? formatDateTimeID(modal.item.submittedAt) : "-"}
            </p>
          </div>
          <Textarea
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={modal?.action === "approve" ? "Catatan persetujuan (opsional)" : "Tuliskan catatan / alasan (wajib)"}
          />
          <Link href={`/surat/${modal?.item.id ?? ""}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-navy-700 hover:underline">
            <ExternalLink className="h-3 w-3" /> Baca dokumen lengkap sebelum memutuskan
          </Link>
        </div>
      </Modal>
    </div>
  );
}
