"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Archive, Download, Eye, Printer, Search } from "lucide-react";
import { api, buildQuery } from "@/lib/client";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Pagination, Select, StatCard, Table, TBody, TD, TH, THead, TR, LoadingRows } from "@/components/ui";
import { StatusPill } from "@/components/letter-table";
import { formatDateID, formatDateTimeID } from "@/lib/status";

type ArchiveRow = {
  id: number;
  title: string;
  letterNumber: string | null;
  status: string;
  categoryName: string | null;
  senderName: string | null;
  departmentName: string | null;
  letterDate: string | null;
  archived: boolean;
  approvedAt: string | null;
  archivedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  stageDurationMs: number;
  priority: string;
  revisionCount: number;
  currentStepLabel: string | null;
  currentApproverRoleLabel: string | null;
};

type Option = { id: number; name: string };

export default function ArchivePage() {
  const [rows, setRows] = useState<ArchiveRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [categories, setCategories] = useState<Option[]>([]);
  const [senders, setSenders] = useState<Option[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const from = year ? `${year}-01-01` : "";
    const to = year ? `${year}-12-31` : "";
    const result = await api<{ rows: ArchiveRow[]; total: number }>(
      `/api/letters${buildQuery({ q: search, scope: "archive", categoryId, senderId, from, to, sort: "number", limit: pageSize, offset: (page - 1) * pageSize })}`,
    );
    if (result.ok) {
      setRows(result.data.rows);
      setTotal(result.data.total);
    } else setError(result.error);
    setLoading(false);
  }, [search, year, categoryId, senderId, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    const loadOptions = async () => {
      const [catRes, userRes] = await Promise.all([
        api<{ items: Option[] }>("/api/categories"),
        api<{ items: Option[] }>("/api/users"),
      ]);
      if (catRes.ok) setCategories(catRes.data.items);
      if (userRes.ok) setSenders(userRes.data.items);
    };
    void loadOptions();
  }, []);

  const years = Array.from({ length: 6 }, (_, index) => String(new Date().getFullYear() - index));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Arsip Digital</h1>
          <p className="mt-1 text-sm text-slate-500">
            Seluruh surat yang telah selesai diproses tersimpan terstruktur dan dapat ditelusuri, diunduh, atau dicetak.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total Arsip" value={total} icon={<Archive className="h-4 w-4" />} tone="green" />
        </div>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Pencarian arsip" className="sm:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Nomor surat, perihal, atau penerima…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </Field>
          <Field label="Tahun">
            <Select value={year} onChange={(e) => { setYear(e.target.value); setPage(1); }}>
              <option value="">Semua tahun</option>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </Select>
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
        </div>
      </Card>

      <Card>
        <CardHeader title="Daftar arsip surat" subtitle={`${total} dokumen tersimpan permanen di basis data dan penyimpanan berkas`} icon={<Archive className="h-4 w-4" />} />
        {loading ? (
          <LoadingRows rows={6} />
        ) : error ? (
          <EmptyState title="Gagal memuat arsip" description={error} action={<Button size="sm" onClick={() => void load()}>Coba lagi</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Archive className="h-6 w-6" />} title="Arsip masih kosong" description="Surat yang telah disetujui dan diselesaikan akan otomatis masuk ke arsip digital." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Nomor Surat</TH>
                <TH>Perihal</TH>
                <TH>Jenis</TH>
                <TH>Pembuat</TH>
                <TH>Tanggal</TH>
                <TH>Status</TH>
                <TH className="text-right">Aksi</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  <TD className="font-mono text-xs">{row.letterNumber ?? "-"}</TD>
                  <TD className="max-w-[320px]">
                    <Link href={`/surat/${row.id}`} className="line-clamp-1 text-sm font-medium text-slate-900 hover:text-navy-700">
                      {row.title}
                    </Link>
                    <span className="text-[11px] text-slate-400">arsip #{row.id}</span>
                  </TD>
                  <TD className="text-xs">{row.categoryName ?? "-"}</TD>
                  <TD className="text-xs">
                    {row.senderName ?? "-"}
                    <span className="block text-[11px] text-slate-400">{row.departmentName ?? ""}</span>
                  </TD>
                  <TD className="text-xs">
                    {formatDateID(row.letterDate)}
                    <span className="block text-[11px] text-slate-400">arsip {row.archivedAt ? formatDateTimeID(row.archivedAt) : "-"}</span>
                  </TD>
                  <TD>
                    <StatusPill status={row.status} />
                    {row.archived ? <Badge className="mt-1 bg-emerald-50 text-emerald-700 ring-emerald-300">berkas tersimpan</Badge> : null}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Link href={`/surat/${row.id}`} title="Pratinjau dokumen">
                        <Button variant="ghost" size="sm" icon={<Eye className="h-3.5 w-3.5" />} />
                      </Link>
                      <a href={`/api/letters/${row.id}/download?format=pdf&inline=1`} target="_blank" rel="noreferrer" title="Unduh PDF">
                        <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} />
                      </a>
                      <a href={`/api/letters/${row.id}/download?format=docx`} title="Unduh DOCX">
                        <Button variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />} />
                      </a>
                      <Link href={`/surat/${row.id}`} title="Cetak">
                        <Button variant="ghost" size="sm" icon={<Printer className="h-3.5 w-3.5" />} />
                      </Link>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </Card>
    </div>
  );
}
