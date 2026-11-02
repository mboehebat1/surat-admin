"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FilePlus2, Filter, RefreshCw, Search } from "lucide-react";
import { api, buildQuery } from "@/lib/client";
import { Button, Card, Field, Input, Pagination, Segmented, Select } from "@/components/ui";
import { LetterTable, type LetterRowDto } from "@/components/letter-table";
import { LETTER_STATUS, STATUS_META } from "@/lib/status";

type Option = { id: number; name: string };

export default function LettersPage() {
  const [rows, setRows] = useState<LetterRowDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [scope, setScope] = useState<"all" | "mine" | "pending" | "archive">("all");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [senderId, setSenderId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "number">("newest");
  const [showFilters, setShowFilters] = useState(false);

  const [categories, setCategories] = useState<Option[]>([]);
  const [departments, setDepartments] = useState<Option[]>([]);
  const [senders, setSenders] = useState<Option[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setSearch(q);
    const scopeParam = params.get("scope");
    if (scopeParam === "mine" || scopeParam === "pending" || scopeParam === "archive") setScope(scopeParam);
  }, []);

  useEffect(() => {
    const load = async () => {
      const [catRes, deptRes, userRes] = await Promise.all([
        api<{ items: Option[] }>("/api/categories"),
        api<{ items: Option[] }>("/api/departments"),
        api<{ items: Option[] }>("/api/users"),
      ]);
      if (catRes.ok) setCategories(catRes.data.items);
      if (deptRes.ok) setDepartments(deptRes.data.items);
      if (userRes.ok) setSenders(userRes.data.items);
    };
    void load();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api<{ rows: LetterRowDto[]; total: number }>(
      `/api/letters${buildQuery({
        q: search,
        scope,
        status: status.join(","),
        categoryId,
        departmentId,
        senderId,
        from,
        to,
        sort,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      })}`,
    );
    if (result.ok) {
      setRows(result.data.rows);
      setTotal(result.data.total);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [search, scope, status, categoryId, departmentId, senderId, from, to, sort, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const reset = () => {
    setSearch("");
    setStatus([]);
    setCategoryId("");
    setDepartmentId("");
    setSenderId("");
    setFrom("");
    setTo("");
    setSort("newest");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Data Surat</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola seluruh surat: draft, pengajuan, pemeriksaan, persetujuan, hingga arsip.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
            Muat ulang
          </Button>
          <Button variant="outline" size="sm" icon={<Filter className="h-3.5 w-3.5" />} onClick={() => setShowFilters((v) => !v)}>
            Filter lanjutan
          </Button>
          <Link href="/surat/baru">
            <Button size="sm" icon={<FilePlus2 className="h-3.5 w-3.5" />}>
              Buat Surat
            </Button>
          </Link>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Cari perihal, nomor surat, atau nama penerima…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Segmented
            value={scope}
            onChange={(value) => {
              setScope(value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "Semua" },
              { value: "mine", label: "Milik saya" },
              { value: "pending", label: "Menunggu saya" },
              { value: "archive", label: "Arsip" },
            ]}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              setStatus([]);
              setPage(1);
            }}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-colors ${
              status.length === 0 ? "bg-navy-900 text-white ring-navy-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"
            }`}
          >
            Semua status
          </button>
          {LETTER_STATUS.map((key) => {
            const meta = STATUS_META[key];
            const active = status.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setStatus((current) => (active ? current.filter((s) => s !== key) : [...current, key]));
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset transition-all ${
                  active ? "bg-navy-50 text-navy-800 ring-navy-300" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </button>
            );
          })}
        </div>

        {showFilters ? (
          <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Jenis surat">
              <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}>
                <option value="">Semua jenis</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Departemen">
              <Select value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setPage(1); }}>
                <option value="">Semua departemen</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Pembuat surat">
              <Select value={senderId} onChange={(e) => { setSenderId(e.target.value); setPage(1); }}>
                <option value="">Semua pembuat</option>
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Urutkan">
              <Select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }}>
                <option value="newest">Terbaru</option>
                <option value="oldest">Terlama</option>
                <option value="number">Nomor surat</option>
              </Select>
            </Field>
            <Field label="Tanggal dari">
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
            </Field>
            <Field label="Tanggal sampai">
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
            </Field>
            <div className="flex items-end sm:col-span-2">
              <Button variant="ghost" size="sm" onClick={reset}>
                Reset semua filter
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <LetterTable
        rows={rows}
        loading={loading}
        error={error}
        onRetry={() => void load()}
        columns={["number", "title", "category", "sender", "date", "stage", "duration", "status"]}
        emptyTitle="Tidak ada surat yang cocok"
        emptyDescription="Ubah kata kunci atau filter pencarian Anda."
      />

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
    </div>
  );
}
