"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, Inbox } from "lucide-react";
import { Badge, EmptyState, LoadingRows, StatusBadge, Table, TBody, TD, TH, THead, TR, cn } from "@/components/ui";
import { STATUS_META, durationLabel, formatDateID, formatDateTimeID, type LetterStatus } from "@/lib/status";

export type LetterRowDto = {
  id: number;
  title: string;
  letterNumber: string | null;
  status: string;
  statusLabel: string;
  categoryName: string | null;
  templateName: string | null;
  senderName: string | null;
  departmentName: string | null;
  recipientName: string | null;
  letterDate: string | null;
  priority: string;
  classification: string;
  revisionCount: number;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  currentStepLabel: string | null;
  currentApproverRoleLabel: string | null;
  stageDurationMs: number;
  archived: boolean;
};

export function StatusPill({ status }: { status: string }) {
  const meta = STATUS_META[(status as LetterStatus) ?? "draft"] ?? STATUS_META.draft;
  return <StatusBadge label={meta.label} className={meta.badge} dot={meta.dot} />;
}

export function PriorityPill({ priority }: { priority: string }) {
  if (priority === "normal") return null;
  return (
    <Badge className={priority === "mendesak" ? "bg-red-50 text-red-700 ring-red-300" : "bg-amber-50 text-amber-700 ring-amber-300"}>
      {priority === "mendesak" ? "Mendesak" : "Prioritas Tinggi"}
    </Badge>
  );
}

type Column = "number" | "title" | "category" | "sender" | "department" | "date" | "stage" | "status" | "duration";

const DEFAULT_COLUMNS: Column[] = ["number", "title", "category", "sender", "date", "stage", "status"];

export function LetterTable({
  rows,
  loading,
  error,
  columns = DEFAULT_COLUMNS,
  emptyTitle = "Belum ada surat",
  emptyDescription = "Surat yang dibuat akan tampil di sini.",
  onRetry,
}: {
  rows: LetterRowDto[];
  loading?: boolean;
  error?: string | null;
  columns?: Column[];
  emptyTitle?: string;
  emptyDescription?: string;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <LoadingRows rows={6} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-8 text-center text-sm text-red-700">
        {error}
        {onRetry ? (
          <button type="button" onClick={onRetry} className="ml-2 font-semibold underline">
            Coba lagi
          </button>
        ) : null}
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white">
        <EmptyState
          icon={<Inbox className="h-6 w-6" />}
          title={emptyTitle}
          description={emptyDescription}
        />
      </div>
    );
  }

  const headers: Record<Column, string> = {
    number: "Nomor Surat",
    title: "Perihal",
    category: "Jenis",
    sender: "Pembuat",
    department: "Departemen",
    date: "Tanggal Surat",
    stage: "Tahap Saat Ini",
    status: "Status",
    duration: "Lama di Tahap Ini",
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <THead>
          <tr>
            {columns.map((column) => (
              <TH key={column}>{headers[column]}</TH>
            ))}
            <TH className="w-10" />
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => {
            const meta = STATUS_META[(row.status as LetterStatus) ?? "draft"] ?? STATUS_META.draft;
            return (
              <TR key={row.id}>
                {columns.includes("number") ? (
                  <TD>
                    <span className="font-mono text-xs text-slate-700">{row.letterNumber ?? "—"}</span>
                  </TD>
                ) : null}
                {columns.includes("title") ? (
                  <TD className="max-w-[340px]">
                    <Link href={`/surat/${row.id}`} className="group block">
                      <span className="line-clamp-1 text-sm font-medium text-slate-900 group-hover:text-navy-700">
                        {row.title}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">#{row.id}</span>
                        {row.recipientName ? (
                          <span className="text-[11px] text-slate-400">→ {row.recipientName}</span>
                        ) : null}
                        {row.revisionCount > 0 ? (
                          <Badge className="bg-amber-50 text-amber-700 ring-amber-300">{row.revisionCount}× revisi</Badge>
                        ) : null}
                        <PriorityPill priority={row.priority} />
                      </span>
                    </Link>
                  </TD>
                ) : null}
                {columns.includes("category") ? (
                  <TD>
                    <span className="text-xs text-slate-600">{row.categoryName ?? "—"}</span>
                  </TD>
                ) : null}
                {columns.includes("sender") ? (
                  <TD>
                    <span className="text-xs text-slate-700">{row.senderName ?? "—"}</span>
                    {row.departmentName ? (
                      <span className="mt-0.5 block text-[11px] text-slate-400">{row.departmentName}</span>
                    ) : null}
                  </TD>
                ) : null}
                {columns.includes("department") ? (
                  <TD>
                    <span className="text-xs text-slate-600">{row.departmentName ?? "—"}</span>
                  </TD>
                ) : null}
                {columns.includes("date") ? (
                  <TD>
                    <span className="text-xs text-slate-600">{formatDateID(row.letterDate)}</span>
                    <span className="mt-0.5 block text-[11px] text-slate-400">
                      dibuat {formatDateTimeID(row.createdAt)}
                    </span>
                  </TD>
                ) : null}
                {columns.includes("stage") ? (
                  <TD>
                    {row.currentStepLabel ? (
                      <span className="text-xs text-slate-700">{row.currentStepLabel}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                    {row.currentApproverRoleLabel ? (
                      <span className="mt-0.5 block text-[11px] text-slate-400">{row.currentApproverRoleLabel}</span>
                    ) : null}
                  </TD>
                ) : null}
                {columns.includes("duration") ? (
                  <TD>
                    <span className={cn("inline-flex items-center gap-1 text-xs", row.stageDurationMs > 86400000 * 2 ? "text-red-600" : "text-slate-600")}>
                      <Clock className="h-3.5 w-3.5" />
                      {durationLabel(row.stageDurationMs)}
                    </span>
                  </TD>
                ) : null}
                {columns.includes("status") ? (
                  <TD>
                    <StatusPill status={row.status} />
                    {meta.group === "red" && row.revisionCount > 0 ? (
                      <span className="mt-1 block text-[11px] text-red-500">perlu tindakan pembuat</span>
                    ) : null}
                  </TD>
                ) : null}
                <TD>
                  <Link
                    href={`/surat/${row.id}`}
                    className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition-colors hover:bg-navy-50 hover:text-navy-700"
                    aria-label="Buka detail surat"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
