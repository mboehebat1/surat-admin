"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, Clock, ExternalLink, RefreshCw } from "lucide-react";
import { api, buildQuery } from "@/lib/client";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Pagination, Select, cn } from "@/components/ui";
import { LetterTable, type LetterRowDto } from "@/components/letter-table";
import { LETTER_STATUS, ROLE_LABEL, STATUS_META, durationLabel, formatDateTimeID } from "@/lib/status";

type Option = { id: number; name: string };
type StageDto = {
  id: number;
  cycle: number;
  stepOrder: number;
  label: string;
  roleCode: string;
  status: string;
  note: string | null;
  approverName: string | null;
  actedAt: string | null;
  dueAt: string | null;
  createdAt: string;
};

export default function MonitoringPage() {
  const [rows, setRows] = useState<LetterRowDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [approverRole, setApproverRole] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const [categories, setCategories] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [senders, setSenders] = useState<Option[]>([]);

  const [selected, setSelected] = useState<{ id: number; title: string; stages: StageDto[] } | null>(null);
  const [stageLoading, setStageLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api<{ rows: LetterRowDto[]; total: number }>(
      `/api/letters${buildQuery({ q: search, status, categoryId, departmentId, senderId, approverRole, from, to, limit: pageSize, offset: (page - 1) * pageSize })}`,
    );
    if (result.ok) {
      setRows(result.data.rows);
      setTotal(result.data.total);
      setLastUpdate(new Date());
    } else setError(result.error);
    setLoading(false);
  }, [search, status, categoryId, departmentId, senderId, approverRole, from, to, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, load]);

  useEffect(() => {
    const loadOptions = async () => {
      const [catRes, deptRes, userRes] = await Promise.all([
        api<{ items: Option[] }>("/api/categories"),
        api<{ items: Option[] }>("/api/departments"),
        api<{ items: Option[] }>("/api/users"),
      ]);
      if (catRes.ok) setCategories(catRes.data.items);
      if (deptRes.ok) setDepartments(deptRes.data.items);
      if (userRes.ok) setSenders(userRes.data.items);
    };
    void loadOptions();
  }, []);

  const openStages = async (letterId: number, title: string) => {
    setSelected({ id: letterId, title, stages: [] });
    setStageLoading(true);
    const result = await api<{ approvals: StageDto[] }>(`/api/letters/${letterId}`);
    setStageLoading(false);
    if (result.ok) setSelected({ id: letterId, title, stages: result.data.approvals });
  };

  const statusSummary = LETTER_STATUS.map((key) => ({
    key,
    label: STATUS_META[key].label,
    dot: STATUS_META[key].dot,
    count: rows.filter((row) => row.status === key).length,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Monitoring Aktivitas Persuratan</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pantau posisi surat, pihak yang memproses, dan lama waktu di setiap tahapan.
            {lastUpdate ? ` Pembaruan terakhir ${lastUpdate.toLocaleTimeString("id-ID")}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300 text-navy-700" />
            Segarkan otomatis (30 detik)
          </label>
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
            Segarkan
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {statusSummary.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => {
              setStatus((current) => (current === item.key ? "" : item.key));
              setPage(1);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors",
              status === item.key ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", item.dot)} />
            {item.label}
            {item.count > 0 ? <span className="tabular-nums opacity-70">({item.count})</span> : null}
          </button>
        ))}
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Pencarian" className="sm:col-span-2">
            <Input placeholder="Nama surat atau nomor surat…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </Field>
          <Field label="Jenis surat">
            <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
              <option value="">Semua jenis</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Pembuat surat">
            <Select value={senderId} onChange={(e) => { setSenderId(e.target.value); setPage(1); }}>
              <option value="">Semua pembuat</option>
              {senders.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Departemen">
            <Select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}>
              <option value="">Semua departemen</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </Field>
          <Field label="Pihak penyetuju saat ini">
            <Select value={approverRole} onChange={(e) => { setApproverRole(e.target.value); setPage(1); }}>
              <option value="">Semua pihak</option>
              {Object.entries(ROLE_LABEL).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Tanggal pengajuan dari">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </Field>
          <Field label="Tanggal pengajuan sampai">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </Field>
        </div>
      </Card>

      <LetterTable
        rows={rows}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        columns={["number", "title", "category", "sender", "department", "date", "stage", "duration", "status"]}
        emptyTitle="Tidak ada aktivitas surat"
        emptyDescription="Ubah filter untuk menampilkan data monitoring."
      />

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <Card>
        <CardHeader
          title="Lama waktu surat di setiap tahapan"
          subtitle={selected ? `${selected.title} (#${selected.id})` : "Klik salah satu surat pada tabel untuk melihat rinciannya."}
          icon={<Activity className="h-4 w-4" />}
          action={selected ? <Link href={`/surat/${selected.id}`}><Button variant="outline" size="sm" icon={<ExternalLink className="h-3.5 w-3.5" />}>Buka surat</Button></Link> : null}
        />
        {!selected ? (
          <EmptyState icon={<Clock className="h-6 w-6" />} title="Belum ada surat dipilih" description="Pilih surat pada tabel di atas untuk melihat durasi tiap tahap persetujuan." />
        ) : stageLoading ? (
          <p className="px-5 py-8 text-center text-xs text-slate-400">Memuat tahapan…</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {selected.stages.map((stage, index) => {
              const previous = selected.stages[index - 1];
              const start = previous?.actedAt ?? stage.createdAt;
              const end = stage.actedAt ?? new Date().toISOString();
              const duration = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
              const isLate = !stage.actedAt && stage.dueAt && new Date(stage.dueAt).getTime() < Date.now();
              return (
                <li key={stage.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-navy-50 text-[11px] font-semibold text-navy-800">
                    {stage.cycle}.{stage.stepOrder}
                  </span>
                  <div className="min-w-[180px] flex-1">
                    <p className="text-xs font-semibold text-slate-800">{stage.label}</p>
                    <p className="text-[11px] text-slate-500">
                      {ROLE_LABEL[stage.roleCode] ?? stage.roleCode}
                      {stage.approverName ? ` · ${stage.approverName}` : ""}
                    </p>
                  </div>
                  <Badge className={stage.status === "approved" ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : stage.status === "pending" ? "bg-amber-50 text-amber-700 ring-amber-300" : stage.status === "rejected" || stage.status === "revision" ? "bg-red-50 text-red-700 ring-red-300" : "bg-slate-100 text-slate-600 ring-slate-200"}>
                    {stage.status}
                  </Badge>
                  {isLate ? <Badge className="bg-red-50 text-red-700 ring-red-300">lewat SLA</Badge> : null}
                  <span className="w-40 text-right text-[11px] text-slate-500">
                    <span className="flex items-center justify-end gap-1 font-medium text-slate-700">
                      <Clock className="h-3 w-3" /> {durationLabel(duration)}
                    </span>
                    {stage.actedAt ? formatDateTimeID(stage.actedAt) : "menunggu tindakan"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
