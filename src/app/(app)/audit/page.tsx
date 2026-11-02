"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Search, ShieldCheck } from "lucide-react";
import { api, buildQuery } from "@/lib/client";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, LoadingRows, Pagination, Select, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { formatDateTimeID } from "@/lib/status";

type AuditItem = {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type Option = { id: number; name: string };

const ACTION_LABEL: Record<string, string> = {
  login: "Masuk",
  logout: "Keluar",
  login_gagal: "Gagal masuk",
  buat_surat: "Buat surat",
  ubah_surat: "Ubah surat",
  hapus_surat: "Hapus surat",
  ajukan_surat: "Ajukan surat",
  mulai_pemeriksaan: "Mulai pemeriksaan",
  setujui_tahap: "Setujui tahap",
  persetujuan_final: "Persetujuan final",
  tolak_surat: "Tolak surat",
  minta_revisi: "Minta revisi",
  distribusi_surat: "Distribusi surat",
  arsipkan_surat: "Arsipkan surat",
  unduh_dokumen: "Unduh dokumen",
  unggah_lampiran: "Unggah lampiran",
  hapus_lampiran: "Hapus lampiran",
  duplikasi_surat: "Duplikasi surat",
  generate_dokumen: "Buat dokumen",
  tambah_template: "Tambah template",
  ubah_template: "Ubah template",
  hapus_template: "Hapus template",
  duplikasi_template: "Duplikasi template",
  nonaktifkan_template: "Nonaktifkan template",
  tambah_pengguna: "Tambah pengguna",
  ubah_pengguna: "Ubah pengguna",
  ubah_hak_akses: "Ubah hak akses",
  hapus_pengguna: "Hapus pengguna",
  nonaktifkan_pengguna: "Nonaktifkan pengguna",
  tambah_alur: "Tambah alur",
  ubah_alur: "Ubah alur",
  hapus_alur: "Hapus alur",
  tambah_departemen: "Tambah departemen",
  ubah_departemen: "Ubah departemen",
  hapus_departemen: "Hapus departemen",
  ekspor_laporan: "Ekspor laporan",
};

export default function AuditPage() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [actions, setActions] = useState<{ action: string; total: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [users, setUsers] = useState<Option[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await api<{ items: AuditItem[]; total: number; actions: { action: string; total: number }[] }>(
      `/api/audit${buildQuery({ q: search, action, entity, userId, from, to, limit: pageSize, offset: (page - 1) * pageSize })}`,
    );
    if (result.ok) {
      setItems(result.data.items);
      setTotal(result.data.total);
      setActions(result.data.actions);
    } else setError(result.error);
    setLoading(false);
  }, [search, action, entity, userId, from, to, page]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    const loadUsers = async () => {
      const result = await api<{ items: Option[] }>("/api/users");
      if (result.ok) setUsers(result.data.items);
    };
    void loadUsers();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Audit Log Sistem</h1>
          <p className="mt-1 text-sm text-slate-500">
            Rekam jejak seluruh aktivitas penting. Data hanya dapat dibaca — tidak dapat diubah oleh pengguna.
          </p>
        </div>
        <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
          Segarkan
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Pencarian" className="sm:col-span-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-9" placeholder="Deskripsi, pengguna, atau aksi…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
          </Field>
          <Field label="Jenis aktivitas">
            <Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
              <option value="">Semua aktivitas</option>
              {actions.map((item) => (
                <option key={item.action} value={item.action}>
                  {ACTION_LABEL[item.action] ?? item.action} ({item.total})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Pengguna">
            <Select value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }}>
              <option value="">Semua pengguna</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </Select>
          </Field>
          <Field label="Objek (entitas)">
            <Select value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
              <option value="">Semua objek</option>
              {["letters", "letter_attachments", "letter_templates", "users", "departments", "approval_workflows", "reports"].map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </Select>
          </Field>
          <Field label="Dari tanggal">
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </Field>
          <Field label="Sampai tanggal">
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Riwayat aktivitas" subtitle={`${total} catatan audit`} icon={<ShieldCheck className="h-4 w-4" />} />
        {loading ? (
          <LoadingRows rows={8} />
        ) : error ? (
          <EmptyState title="Gagal memuat audit log" description={error} action={<Button size="sm" onClick={() => void load()}>Coba lagi</Button>} />
        ) : items.length === 0 ? (
          <EmptyState title="Tidak ada catatan" description="Belum ada aktivitas yang cocok dengan filter." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Waktu</TH>
                <TH>Pengguna</TH>
                <TH>Aktivitas</TH>
                <TH>Objek</TH>
                <TH>Keterangan</TH>
                <TH>IP</TH>
              </tr>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD className="whitespace-nowrap text-[11px] text-slate-500">{formatDateTimeID(item.createdAt)}</TD>
                  <TD className="text-xs">
                    <span className="font-medium text-slate-800">{item.userName ?? "Sistem"}</span>
                    <span className="block text-[11px] text-slate-400">{item.userEmail}</span>
                  </TD>
                  <TD>
                    <Badge className="bg-navy-50 text-navy-800 ring-navy-200">{ACTION_LABEL[item.action] ?? item.action}</Badge>
                  </TD>
                  <TD className="text-[11px] text-slate-500">
                    {item.entity ?? "-"}
                    {item.entityId ? ` #${item.entityId}` : ""}
                  </TD>
                  <TD className="max-w-[380px] text-xs text-slate-600">{item.description ?? "-"}</TD>
                  <TD className="font-mono text-[11px] text-slate-400">{item.ipAddress ?? "-"}</TD>
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
