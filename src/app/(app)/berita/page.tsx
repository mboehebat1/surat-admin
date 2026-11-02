"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Megaphone, Pencil, Pin, PinOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  LoadingRows,
  Modal,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  useToast,
} from "@/components/ui";
import { formatDateID } from "@/lib/status";
import { ANNOUNCEMENT_CATEGORIES, announcementCategoryLabel, announcementCategoryTone } from "@/lib/announcement-meta";

type AnnouncementDto = {
  id: number;
  title: string;
  body: string;
  category: string;
  isPublished: boolean;
  isPinned: boolean;
  publishedAt: string;
  updatedAt: string;
};

type FormState = {
  id?: number;
  title: string;
  body: string;
  category: string;
  isPublished: boolean;
  isPinned: boolean;
  publishedAt: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  category: "pengumuman",
  isPublished: true,
  isPinned: false,
  publishedAt: "",
};

function toDateInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export default function AnnouncementPage() {
  const toast = useToast();
  const [items, setItems] = useState<AnnouncementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api<{ items: AnnouncementDto[] }>("/api/announcements/manage");
    if (result.ok) {
      setItems(result.data.items);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      total: items.length,
      published: items.filter((item) => item.isPublished).length,
      pinned: items.filter((item) => item.isPinned).length,
    }),
    [items],
  );

  const openCreate = () => setForm({ ...EMPTY_FORM });

  const openEdit = (item: AnnouncementDto) =>
    setForm({
      id: item.id,
      title: item.title,
      body: item.body,
      category: item.category,
      isPublished: item.isPublished,
      isPinned: item.isPinned,
      publishedAt: toDateInput(item.publishedAt),
    });

  const save = async () => {
    if (!form) return;
    if (form.title.trim().length < 3) {
      toast.push("error", "Judul minimal 3 karakter.");
      return;
    }
    if (form.body.trim().length < 10) {
      toast.push("error", "Isi berita minimal 10 karakter.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category,
      isPublished: form.isPublished,
      isPinned: form.isPinned,
      publishedAt: form.publishedAt ? new Date(`${form.publishedAt}T09:00:00`).toISOString() : null,
    };
    const result = form.id
      ? await api(`/api/announcements/${form.id}`, { method: "PATCH", body: payload })
      : await api("/api/announcements/manage", { method: "POST", body: payload });
    setSaving(false);
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    toast.push("success", form.id ? "Berita diperbarui." : "Berita ditambahkan.");
    setForm(null);
    await load();
  };

  const toggle = async (item: AnnouncementDto, patch: Partial<AnnouncementDto>) => {
    setBusyId(item.id);
    const result = await api(`/api/announcements/${item.id}`, { method: "PATCH", body: patch });
    setBusyId(null);
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    setItems((current) => current.map((row) => (row.id === item.id ? { ...row, ...patch } : row)));
  };

  const remove = async (item: AnnouncementDto) => {
    if (!window.confirm(`Hapus berita "${item.title}"?`)) return;
    setBusyId(item.id);
    const result = await api(`/api/announcements/${item.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    toast.push("success", "Berita dihapus.");
    setItems((current) => current.filter((row) => row.id !== item.id));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Berita &amp; Pengumuman</h1>
          <p className="mt-1 text-sm text-slate-500">
            Berita terbit tampil di halaman login (tampilan awal). Hanya Super Admin yang dapat menambah atau
            mengubahnya.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={() => void load()}>
            Muat ulang
          </Button>
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Tambah berita
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Daftar berita"
          subtitle={`${counts.total} berita · ${counts.published} terbit · ${counts.pinned} disematkan`}
          icon={<Megaphone className="h-4 w-4" />}
        />

        {loading ? (
          <div className="p-4">
            <LoadingRows rows={3} />
          </div>
        ) : error ? (
          <div className="p-4">
            <EmptyState icon={<Megaphone className="h-5 w-5" />} title="Gagal memuat berita" description={error} />
          </div>
        ) : items.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Megaphone className="h-5 w-5" />}
              title="Belum ada berita"
              description="Tambahkan berita atau pengumuman agar tampil di halaman login."
            />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Judul</TH>
                <TH>Kategori</TH>
                <TH>Tanggal terbit</TH>
                <TH>Status</TH>
                <TH className="text-right">Aksi</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((item) => (
                <TR key={item.id}>
                  <TD>
                    <div className="flex items-start gap-2">
                      {item.isPinned ? <Pin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-navy-600" /> : null}
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-slate-800">{item.title}</p>
                        <p className="mt-0.5 line-clamp-2 max-w-xl text-[11px] leading-relaxed text-slate-500">
                          {item.body}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <Badge className={announcementCategoryTone(item.category)}>
                      {announcementCategoryLabel(item.category)}
                    </Badge>
                  </TD>
                  <TD>
                    <span className="flex items-center gap-1 text-xs text-slate-600">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                      {formatDateID(item.publishedAt)}
                    </span>
                  </TD>
                  <TD>
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void toggle(item, { isPublished: !item.isPublished })}
                      className="text-left disabled:opacity-50"
                    >
                      <Badge
                        className={
                          item.isPublished
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-slate-100 text-slate-600 ring-slate-200"
                        }
                      >
                        {item.isPublished ? "Terbit" : "Draft"}
                      </Badge>
                    </button>
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void toggle(item, { isPinned: !item.isPinned })}
                        title={item.isPinned ? "Lepas sematan" : "Sematkan di atas"}
                        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-700 disabled:opacity-50"
                      >
                        {item.isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        title="Ubah"
                        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-700"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void remove(item)}
                        title="Hapus"
                        className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Ubah berita" : "Tambah berita"}
        description="Berita yang diterbitkan akan tampil di halaman login."
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Batal
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              Simpan
            </Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-4">
            <Field label="Judul">
              <Input
                value={form.title}
                maxLength={160}
                placeholder="Contoh: Pemeliharaan sistem Sabtu malam"
                onChange={(event) => setForm({ ...form, title: event.target.value })}
              />
            </Field>
            <Field label="Isi berita" hint="Teks singkat; 2–3 baris pertama tampil di halaman login.">
              <Textarea
                rows={5}
                maxLength={4000}
                value={form.body}
                placeholder="Tulis isi pengumuman…"
                onChange={(event) => setForm({ ...form, body: event.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kategori">
                <Select
                  value={form.category}
                  onChange={(event) => setForm({ ...form, category: event.target.value })}
                >
                  {ANNOUNCEMENT_CATEGORIES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tanggal terbit" hint="Kosongkan untuk memakai tanggal hari ini.">
                <Input
                  type="date"
                  value={form.publishedAt}
                  onChange={(event) => setForm({ ...form, publishedAt: event.target.value })}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={form.isPublished}
                  onChange={(event) => setForm({ ...form, isPublished: event.target.checked })}
                />
                Terbitkan
              </label>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={form.isPinned}
                  onChange={(event) => setForm({ ...form, isPinned: event.target.checked })}
                />
                Sematkan di urutan teratas
              </label>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
