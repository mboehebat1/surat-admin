"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Clock, Download, FileSpreadsheet, RefreshCw } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Card, CardHeader, EmptyState, LoadingRows, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { CategoryPieChart, MonthlyLetterChart, StatusBarChart } from "@/components/charts";
import { STATUS_META, formatDateTimeID, type LetterStatus } from "@/lib/status";

type Report = {
  monthly: { label: string; total: number; masuk: number; keluar: number; disetujui: number; ditolak: number }[];
  categories: { name: string; code: string; total: number }[];
  productivity: { name: string; department: string | null; dibuat: number; disetujui: number }[];
  timing: { avgHours: number; approved: number; rejected: number; revised: number; late: number; overduePending: number };
  statusCounts: { counts: Record<string, number>; total: number };
  overdue: { letterId: number; title: string; letterNumber: string | null; status: string; sender: string | null; stage: string; dueAt: string | null; stageEnteredAt: string | null }[];
  slowest: { id: number; title: string; letterNumber: string | null; category: string | null; sender: string | null; hours: number }[];
  generatedAt: string;
};

const STATUS_FILL: Record<string, string> = {
  draft: "#94a3b8",
  diajukan: "#6090fa",
  menunggu_pemeriksaan: "#f59e0b",
  dalam_pemeriksaan: "#2550eb",
  revisi: "#ef4444",
  menunggu_persetujuan: "#fbbf24",
  disetujui: "#10b981",
  ditolak: "#dc2626",
  selesai: "#059669",
  diarsipkan: "#047857",
};

export default function ReportPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api<Report>("/api/reports");
    if (result.ok) setReport(result.data);
    else setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card>
        <CardHeader title="Laporan & Statistik" subtitle="Memuat agregasi data persuratan…" icon={<BarChart3 className="h-4 w-4" />} />
        <LoadingRows rows={8} />
      </Card>
    );
  }
  if (error || !report) {
    return (
      <Card>
        <EmptyState icon={<AlertTriangle className="h-6 w-6 text-red-500" />} title="Gagal memuat laporan" description={error ?? undefined} action={<Button size="sm" onClick={() => void load()}>Coba lagi</Button>} />
      </Card>
    );
  }

  const counts = report.statusCounts.counts;
  const statusChart = (Object.keys(STATUS_META) as LetterStatus[]).map((key) => ({
    label: STATUS_META[key].label,
    total: counts[key] ?? 0,
    fill: STATUS_FILL[key] ?? "#94a3b8",
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Laporan &amp; Statistik Persuratan</h1>
          <p className="mt-1 text-sm text-slate-500">
            Agregasi dihitung langsung dari basis data. Diperbarui {formatDateTimeID(report.generatedAt)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
            Segarkan
          </Button>
          <a href="/api/reports/export?format=pdf">
            <Button variant="outline" size="sm" icon={<Download className="h-3.5 w-3.5" />}>
              Ekspor PDF
            </Button>
          </a>
          <a href="/api/reports/export?format=excel">
            <Button size="sm" icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
              Ekspor Excel
            </Button>
          </a>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Surat" value={report.statusCounts.total} icon={<BarChart3 className="h-5 w-5" />} tone="navy" />
        <StatCard label="Disetujui" value={(counts.disetujui ?? 0) + (counts.selesai ?? 0) + (counts.diarsipkan ?? 0)} icon={<BarChart3 className="h-5 w-5" />} tone="green" />
        <StatCard label="Ditolak" value={counts.ditolak ?? 0} icon={<AlertTriangle className="h-5 w-5" />} tone="red" />
        <StatCard label="Rata-rata Persetujuan" value={`${report.timing.avgHours.toFixed(1)} jam`} icon={<Clock className="h-5 w-5" />} tone="amber" hint="Dari pengajuan hingga disetujui" />
        <StatCard label="Melewati SLA" value={report.timing.overduePending} icon={<AlertTriangle className="h-5 w-5" />} tone="red" hint="Tahapan menunggu melewati batas" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Jumlah surat per bulan" subtitle="12 bulan terakhir, dipisah surat masuk dan keluar" />
          <div className="p-4">
            <MonthlyLetterChart data={report.monthly} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Surat per kategori" />
          <div className="p-4">
            <CategoryPieChart data={report.categories.map((c) => ({ name: c.name, total: c.total }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader title="Distribusi status" subtitle="Jumlah surat pada tiap status" />
          <div className="p-4">
            <StatusBarChart data={statusChart} />
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader title="Produktivitas pengguna" subtitle="Jumlah surat dibuat dan yang berhasil disetujui" />
          <Table>
            <THead>
              <tr>
                <TH>Pengguna</TH>
                <TH>Departemen</TH>
                <TH>Surat dibuat</TH>
                <TH>Disetujui</TH>
                <TH>Tingkat persetujuan</TH>
              </tr>
            </THead>
            <TBody>
              {report.productivity.map((item) => {
                const rate = item.dibuat > 0 ? Math.round((item.disetujui / item.dibuat) * 100) : 0;
                return (
                  <TR key={item.name}>
                    <TD className="text-xs font-medium text-slate-800">{item.name}</TD>
                    <TD className="text-xs">{item.department ?? "-"}</TD>
                    <TD className="text-xs tabular-nums">{item.dibuat}</TD>
                    <TD className="text-xs tabular-nums">{item.disetujui}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-[11px] tabular-nums text-slate-500">{rate}%</span>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Surat terlambat diproses" subtitle="Tahapan yang melewati batas waktu (SLA)" icon={<AlertTriangle className="h-4 w-4" />} />
          {report.overdue.length === 0 ? (
            <EmptyState title="Tidak ada keterlambatan" description="Semua tahapan masih dalam batas SLA." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Surat</TH>
                  <TH>Tahap</TH>
                  <TH>Batas waktu</TH>
                </tr>
              </THead>
              <TBody>
                {report.overdue.map((item) => (
                  <TR key={`${item.letterId}-${item.stage}`}>
                    <TD className="max-w-[260px]">
                      <span className="line-clamp-1 text-xs font-medium text-slate-800">{item.title}</span>
                      <span className="text-[11px] text-slate-400">{item.letterNumber ?? `#${item.letterId}`} · {item.sender ?? "-"}</span>
                    </TD>
                    <TD>
                      <Badge className="bg-amber-50 text-amber-700 ring-amber-300">{item.stage}</Badge>
                    </TD>
                    <TD className="text-[11px] text-red-600">{item.dueAt ? formatDateTimeID(item.dueAt) : "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Waktu proses terlama" subtitle="Durasi pengajuan hingga persetujuan (atau sampai sekarang)" icon={<Clock className="h-4 w-4" />} />
          <Table>
            <THead>
              <tr>
                <TH>Surat</TH>
                <TH>Kategori</TH>
                <TH>Durasi</TH>
              </tr>
            </THead>
            <TBody>
              {report.slowest.map((item) => (
                <TR key={item.id}>
                  <TD className="max-w-[260px]">
                    <span className="line-clamp-1 text-xs font-medium text-slate-800">{item.title}</span>
                    <span className="text-[11px] text-slate-400">{item.letterNumber ?? `#${item.id}`} · {item.sender ?? "-"}</span>
                  </TD>
                  <TD className="text-xs">{item.category ?? "-"}</TD>
                  <TD className="text-xs tabular-nums">{item.hours} jam</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
