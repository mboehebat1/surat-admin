"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Copy,
  Eye,
  FileText,
  FolderPlus,
  LibraryBig,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/client";
import { PLACEHOLDER_SYNTAXES, extractPlaceholders } from "@/lib/placeholders";
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
  Segmented,
  Select,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";
import { LetterPreview } from "@/components/letter-preview";
import { FIELD_TYPES, FIELD_TYPE_LABEL } from "@/lib/status";

type FieldDto = {
  id?: number;
  key: string;
  label: string;
  type: string;
  isRequired: boolean;
  defaultValue?: string | null;
  placeholder?: string | null;
  helpText?: string | null;
  sortOrder: number;
};

type TemplateDto = {
  id: number;
  code: string;
  name: string;
  categoryId: number | null;
  categoryName: string | null;
  description: string | null;
  bodyTemplate: string | null;
  docxName: string | null;
  docxPath: string | null;
  pdfName: string | null;
  numberingFormat: string | null;
  kopText: string | null;
  signerName: string | null;
  signerPosition: string | null;
  isActive: boolean;
  fieldCount: number;
  usedCount: number;
  fields: FieldDto[];
};

type CategoryDto = { id: number; code: string; name: string; description: string | null; direction: string; letterCount: number };

type FormState = {
  id?: number;
  name: string;
  code: string;
  categoryId: string;
  description: string;
  bodyTemplate: string;
  numberingFormat: string;
  kopText: string;
  signerName: string;
  signerPosition: string;
  isActive: boolean;
  docxFile: File | null;
  pdfFile: File | null;
  fields: FieldDto[];
};

const EMPTY_FORM: FormState = {
  name: "",
  code: "",
  categoryId: "",
  description: "",
  bodyTemplate: "",
  numberingFormat: "{nomor}/{kode}/{org}/{bulan}/{tahun}",
  kopText: "",
  signerName: "",
  signerPosition: "",
  isActive: true,
  docxFile: null,
  pdfFile: null,
  fields: [],
};

function detectKeys(text: string): string[] {
  return extractPlaceholders(text);
}

function labelFor(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function typeFor(key: string): string {
  if (key.includes("tanggal")) return "date";
  if (key.startsWith("isi") || key.includes("alamat") || key.includes("uraian")) return "textarea";
  if (key.includes("jumlah") || key.includes("tahun")) return "number";
  return "text";
}

export default function TemplatePage() {
  const toast = useToast();
  const [tab, setTab] = useState<"template" | "kategori">("template");
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [form, setForm] = useState<FormState | null>(null);
  const [preview, setPreview] = useState<TemplateDto | null>(null);
  const [categoryForm, setCategoryForm] = useState({ code: "", name: "", description: "", direction: "keluar" });
  const [canManage, setCanManage] = useState(false);
  const [presets, setPresets] = useState<{ installed: number; total: number } | null>(null);
  const [presetBusy, setPresetBusy] = useState<"missing" | "refresh" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [templateRes, categoryRes] = await Promise.all([
      api<{ items: TemplateDto[] }>("/api/templates"),
      api<{ items: CategoryDto[] }>("/api/categories"),
    ]);
    if (templateRes.ok) setTemplates(templateRes.data.items);
    else setError(templateRes.error);
    if (categoryRes.ok) setCategories(categoryRes.data.items);
    setLoading(false);
  }, []);

  const loadPresets = useCallback(async () => {
    const result = await api<{ installed: number; total: number }>("/api/templates/presets");
    if (result.ok) setPresets({ installed: result.data.installed, total: result.data.total });
  }, []);

  useEffect(() => {
    void load();
    void loadPresets();
    void api<{ user: { permissions: string[] } }>("/api/auth/me").then((res) => {
      if (res.ok) setCanManage(res.data.user.permissions.includes("template.kelola"));
    });
  }, [load, loadPresets]);

  const installPresets = async (mode: "missing" | "refresh") => {
    const konfirmasi =
      mode === "refresh"
        ? "Naskah, kop, dan format nomor template standar akan diganti ke versi terbaru. Field yang Anda tambahkan sendiri tetap aman. Lanjutkan?"
        : "Muat template standar yang belum ada di daftar? Template yang sudah ada tidak akan diubah.";
    if (!window.confirm(konfirmasi)) return;
    setPresetBusy(mode);
    const result = await api<{ message: string; created: string[]; updated: string[] }>("/api/templates/presets", {
      method: "POST",
      body: { mode },
    });
    setPresetBusy(null);
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    toast.push("success", result.data.message);
    await Promise.all([load(), loadPresets()]);
  };

  const syncFieldsFromBody = (body: string, existing: FieldDto[]) => {
    const keys = detectKeys(body);
    const merged: FieldDto[] = keys.map((key, index) => {
      const found = existing.find((field) => field.key === key);
      return (
        found ?? {
          key,
          label: labelFor(key),
          type: typeFor(key),
          isRequired: ["perihal", "isi_surat", "nama_penerima"].includes(key),
          sortOrder: index,
        }
      );
    });
    return merged.map((field, index) => ({ ...field, sortOrder: index }));
  };

  const openCreate = () => setForm({ ...EMPTY_FORM });
  const openEdit = (template: TemplateDto) =>
    setForm({
      id: template.id,
      name: template.name,
      code: template.code,
      categoryId: template.categoryId ? String(template.categoryId) : "",
      description: template.description ?? "",
      bodyTemplate: template.bodyTemplate ?? "",
      numberingFormat: template.numberingFormat ?? "{nomor}/{kode}/{org}/{bulan}/{tahun}",
      kopText: template.kopText ?? "",
      signerName: template.signerName ?? "",
      signerPosition: template.signerPosition ?? "",
      isActive: template.isActive,
      docxFile: null,
      pdfFile: null,
      fields: template.fields,
    });

  const submitForm = async () => {
    if (!form) return;
    if (form.name.trim().length < 3) return toast.push("error", "Nama template minimal 3 karakter.");
    if (!form.code.trim()) return toast.push("error", "Kode template wajib diisi.");

    const body = new FormData();
    body.append("name", form.name.trim());
    body.append("code", form.code.trim().toUpperCase());
    body.append("categoryId", form.categoryId);
    body.append("description", form.description);
    body.append("bodyTemplate", form.bodyTemplate);
    body.append("numberingFormat", form.numberingFormat);
    body.append("kopText", form.kopText);
    body.append("signerName", form.signerName);
    body.append("signerPosition", form.signerPosition);
    body.append("isActive", String(form.isActive));
    body.append("fieldsConfig", JSON.stringify(form.fields));
    if (form.docxFile) body.append("docxFile", form.docxFile);
    if (form.pdfFile) body.append("pdfFile", form.pdfFile);

    setSaving(true);
    const result = await api<{ item: TemplateDto; detected?: string[] }>(
      form.id ? `/api/templates/${form.id}` : "/api/templates",
      { method: form.id ? "PATCH" : "POST", body },
    );
    setSaving(false);
    if (!result.ok) return toast.push("error", result.error);
    const detected = result.data.detected?.length ?? 0;
    toast.push(
      "success",
      detected
        ? `Template tersimpan. ${detected} placeholder terdeteksi otomatis dari dokumen.`
        : "Template tersimpan.",
    );
    setForm(null);
    void load();
  };

  const toggleActive = async (template: TemplateDto) => {
    setBusyId(template.id);
    const body = new FormData();
    body.append("isActive", String(!template.isActive));
    const result = await api(`/api/templates/${template.id}`, { method: "PATCH", body });
    setBusyId(null);
    if (result.ok) toast.push("success", `Template ${template.isActive ? "dinonaktifkan" : "diaktifkan"}.`);
    else toast.push("error", result.error);
    if (result.ok) void load();
  };

  const duplicate = async (template: TemplateDto) => {
    setBusyId(template.id);
    const result = await api(`/api/templates/${template.id}/duplicate`, { method: "POST" });
    setBusyId(null);
    if (result.ok) toast.push("success", "Template berhasil diduplikasi.");
    else toast.push("error", result.error);
    if (result.ok) void load();
  };

  const remove = async (template: TemplateDto) => {
    setBusyId(template.id);
    const result = await api(`/api/templates/${template.id}`, { method: "DELETE" });
    setBusyId(null);
    if (result.ok) toast.push("success", "Template dihapus.");
    else toast.push("error", result.error);
    void load();
  };

  const addCategory = async () => {
    if (!categoryForm.code.trim() || categoryForm.name.trim().length < 3) {
      toast.push("error", "Lengkapi kode dan nama kategori.");
      return;
    }
    const result = await api("/api/categories", { method: "POST", body: categoryForm });
    if (!result.ok) return toast.push("error", result.error);
    toast.push("success", "Kategori surat ditambahkan.");
    setCategoryForm({ code: "", name: "", description: "", direction: "keluar" });
    void load();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Manajemen Template Surat</h1>
          <p className="mt-1 text-sm text-slate-500">
            Unggah DOCX/PDF, sistem mendeteksi placeholder <span className="font-mono">{"{{field}}"}</span>,{" "}
            <span className="font-mono">{"<<field>>"}</span>, <span className="font-mono">{"${field}"}</span>, dan{" "}
            <span className="font-mono">{"[field]"}</span> lalu menyusun formulir dinamis secara otomatis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
            Segarkan
          </Button>
          {canManage ? (
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
              Tambah Template
            </Button>
          ) : null}
        </div>
      </div>

      {canManage ? (
        <Card>
          <CardHeader
            title="Template standar persuratan"
            subtitle="Kop instansi, naskah resmi, dan format nomor siap pakai untuk surat dinas, undangan, keterangan, tugas, dan disposisi."
            icon={<LibraryBig className="h-4 w-4" />}
            action={
              <span className="text-[11px] text-slate-500">
                {presets ? `${presets.installed}/${presets.total} terpasang` : "memeriksa…"}
              </span>
            }
          />
          <div className="flex flex-wrap items-center gap-2 px-5 py-4">
            <Button
              size="sm"
              icon={<Sparkles className="h-3.5 w-3.5" />}
              loading={presetBusy === "missing"}
              onClick={() => void installPresets("missing")}
            >
              Muat template standar
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              loading={presetBusy === "refresh"}
              onClick={() => void installPresets("refresh")}
            >
              Perbarui naskah ke versi terbaru
            </Button>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Naskah memakai placeholder <span className="font-mono">{"{{field}}"}</span> sehingga formulir surat terisi
              otomatis.
            </p>
          </div>
        </Card>
      ) : null}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "template", label: "Template", count: templates.length },
          { value: "kategori", label: "Kategori Surat", count: categories.length },
        ]}
      />

      {tab === "template" ? (
        <Card>
          <CardHeader title="Daftar template" subtitle={`${templates.length} template terdaftar`} icon={<FileText className="h-4 w-4" />} />
          {loading ? (
            <LoadingRows rows={5} />
          ) : error ? (
            <EmptyState title="Gagal memuat template" description={error} action={<Button size="sm" onClick={() => void load()}>Coba lagi</Button>} />
          ) : templates.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title="Belum ada template"
              description="Tambahkan template DOCX atau susun naskah dengan placeholder untuk mulai membuat surat otomatis."
              action={canManage ? <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>Tambah Template</Button> : undefined}
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Template</TH>
                  <TH>Kategori</TH>
                  <TH>Field terdeteksi</TH>
                  <TH>Berkas</TH>
                  <TH>Dipakai</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Aksi</TH>
                </tr>
              </THead>
              <TBody>
                {templates.map((template) => (
                  <TR key={template.id}>
                    <TD className="max-w-[260px]">
                      <span className="block truncate text-sm font-medium text-slate-900">{template.name}</span>
                      <span className="font-mono text-[11px] text-slate-400">{template.code}</span>
                      {template.description ? <span className="mt-0.5 block line-clamp-1 text-[11px] text-slate-500">{template.description}</span> : null}
                    </TD>
                    <TD className="text-xs">{template.categoryName ?? "-"}</TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {template.fields.slice(0, 4).map((field) => (
                          <span key={field.key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                            {`{{${field.key}}}`}
                          </span>
                        ))}
                        {template.fields.length > 4 ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">+{template.fields.length - 4}</span>
                        ) : null}
                      </div>
                    </TD>
                    <TD className="text-[11px] text-slate-500">
                      {template.docxName ? <span className="block truncate">DOCX: {template.docxName}</span> : <span className="block text-slate-400">tanpa DOCX</span>}
                      {template.pdfName ? <span className="block truncate">PDF: {template.pdfName}</span> : null}
                    </TD>
                    <TD className="text-xs tabular-nums">{template.usedCount}×</TD>
                    <TD>
                      <Badge className={template.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : "bg-slate-100 text-slate-500 ring-slate-300"}>
                        {template.isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" icon={<Eye className="h-3.5 w-3.5" />} onClick={() => setPreview(template)} title="Pratinjau" />
                        {canManage ? (
                          <>
                            <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => openEdit(template)} title="Ubah" />
                            <Button variant="ghost" size="sm" loading={busyId === template.id} icon={<Copy className="h-3.5 w-3.5" />} onClick={() => duplicate(template)} title="Duplikasi" />
                            <Button variant="ghost" size="sm" icon={<Power className="h-3.5 w-3.5" />} onClick={() => toggleActive(template)} title="Aktif/nonaktifkan" />
                            <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(template)} title="Hapus" />
                          </>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader title="Kategori / jenis surat" subtitle="Kategori menentukan alur persetujuan dan format nomor" />
            {categories.length === 0 ? (
              <EmptyState title="Belum ada kategori" />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Kode</TH>
                    <TH>Nama</TH>
                    <TH>Arah</TH>
                    <TH>Jumlah surat</TH>
                    <TH>Status</TH>
                  </tr>
                </THead>
                <TBody>
                  {categories.map((category) => (
                    <TR key={category.id}>
                      <TD className="font-mono text-xs">{category.code}</TD>
                      <TD className="text-xs font-medium text-slate-800">
                        {category.name}
                        <span className="block text-[11px] font-normal text-slate-400">{category.description ?? "-"}</span>
                      </TD>
                      <TD className="text-xs capitalize">{category.direction}</TD>
                      <TD className="text-xs tabular-nums">{category.letterCount}</TD>
                      <TD>
                        <Badge className={category.direction === "masuk" ? "bg-blue-50 text-blue-700 ring-blue-300" : "bg-navy-50 text-navy-700 ring-navy-200"}>
                          {category.direction === "masuk" ? "Surat masuk" : "Surat keluar"}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>

          {canManage ? (
            <Card>
              <CardHeader title="Tambah kategori" icon={<FolderPlus className="h-4 w-4" />} />
              <div className="space-y-3 p-4">
                <Field label="Kode" required>
                  <Input value={categoryForm.code} onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })} placeholder="SD" maxLength={10} />
                </Field>
                <Field label="Nama kategori" required>
                  <Input value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Surat Dinas" />
                </Field>
                <Field label="Deskripsi">
                  <Textarea className="min-h-[64px]" value={categoryForm.description} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} />
                </Field>
                <Field label="Arah surat">
                  <Select value={categoryForm.direction} onChange={(e) => setCategoryForm({ ...categoryForm, direction: e.target.value })}>
                    <option value="keluar">Keluar</option>
                    <option value="masuk">Masuk</option>
                    <option value="internal">Internal</option>
                  </Select>
                </Field>
                <Button className="w-full" icon={<Plus className="h-4 w-4" />} onClick={addCategory}>
                  Simpan kategori
                </Button>
              </div>
            </Card>
          ) : null}
        </div>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="xl"
        title={form?.id ? "Ubah template surat" : "Tambah template surat"}
        description="Unggah DOCX agar placeholder terdeteksi otomatis, atau tulis naskah dengan salah satu format placeholder yang didukung."
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>Batal</Button>
            <Button loading={saving} onClick={submitForm}>Simpan template</Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama template" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Template Surat Dinas" />
              </Field>
              <Field label="Kode template" required hint={form.id ? "Kode tidak dapat diubah setelah dibuat." : undefined}>
                <Input value={form.code} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="TPL-SD" />
              </Field>
              <Field label="Kategori surat" hint="Opsional — kosongkan bila template dipakai lintas kategori.">
                <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">— tanpa kategori (opsional) —</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Format penomoran" hint="Token: {nomor} {kode} {org} {bulan} {bulan_angka} {tahun} {dept}">
                <Input value={form.numberingFormat} onChange={(e) => setForm({ ...form, numberingFormat: e.target.value })} />
              </Field>
              <Field label="Nama penandatangan">
                <Input value={form.signerName} onChange={(e) => setForm({ ...form, signerName: e.target.value })} />
              </Field>
              <Field label="Jabatan penandatangan">
                <Input value={form.signerPosition} onChange={(e) => setForm({ ...form, signerPosition: e.target.value })} />
              </Field>
              <Field label="Deskripsi" className="sm:col-span-2">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Template DOCX" hint="Placeholder {{…}}, <<…>>, ${…}, atau [field] di dalam dokumen terbaca otomatis">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-navy-400 hover:text-navy-700">
                  <Upload className="h-4 w-4" />
                  <span className="truncate">{form.docxFile ? form.docxFile.name : "Pilih berkas .docx"}</span>
                  <input
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={(e) => setForm({ ...form, docxFile: e.target.files?.[0] ?? null })}
                  />
                </label>
              </Field>
              <Field label="Referensi PDF (opsional)">
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 hover:border-navy-400 hover:text-navy-700">
                  <Upload className="h-4 w-4" />
                  <span className="truncate">{form.pdfFile ? form.pdfFile.name : "Pilih berkas .pdf"}</span>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => setForm({ ...form, pdfFile: e.target.files?.[0] ?? null })}
                  />
                </label>
              </Field>
            </div>

            <Field label="Kop surat" hint="Baris pertama = nama instansi, baris berikutnya = alamat/kontak">
              <Textarea className="min-h-[80px]" value={form.kopText} onChange={(e) => setForm({ ...form, kopText: e.target.value })} placeholder={"PEMERINTAH ...\nDINAS ...\nAlamat ..."} />
            </Field>

            <div className="rounded-lg border border-navy-100 bg-navy-50 px-3 py-2.5">
              <p className="text-[11px] font-semibold text-navy-800">Format placeholder yang didukung</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Semua format setara dan boleh dicampur. Template lama dari Word/Excel tetap terbaca.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PLACEHOLDER_SYNTAXES.map((syntax) => (
                  <span
                    key={syntax.id}
                    title={syntax.description}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-700"
                  >
                    {syntax.sample}
                  </span>
                ))}
              </div>
            </div>

            <Field label="Naskah template (isi surat)" hint="Gunakan {{nama_field}}, <<nama_field>>, ${nama_field}, atau [nama_field] untuk field dinamis">
              <Textarea
                className="min-h-[140px] font-mono text-xs"
                value={form.bodyTemplate}
                onChange={(e) => {
                  const body = e.target.value;
                  setForm({ ...form, bodyTemplate: body, fields: syncFieldsFromBody(body, form.fields) });
                }}
                placeholder={"Sehubungan dengan {{kegiatan}}, bersama ini kami sampaikan:\n\n{{isi_surat}}\n\nDemikian surat ini disampaikan."}
              />
            </Field>

            <div>
              <p className="mb-2 text-xs font-medium text-slate-700">
                Pengaturan field dinamis ({form.fields.length} terdeteksi)
              </p>
              {form.fields.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400">
                  Tulis naskah dengan placeholder atau unggah DOCX agar field terdeteksi.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.fields.map((field, index) => (
                    <div key={field.key} className="grid grid-cols-1 items-end gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1.4fr_1fr_0.8fr_auto]">
                      <Field label={`Placeholder ${index + 1}`}>
                        <Input readOnly value={`{{${field.key}}}`} className="font-mono text-xs" />
                      </Field>
                      <Field label="Label formulir">
                        <Input
                          value={field.label}
                          onChange={(e) => {
                            const fields = [...form.fields];
                            fields[index] = { ...field, label: e.target.value };
                            setForm({ ...form, fields });
                          }}
                        />
                      </Field>
                      <Field label="Tipe">
                        <Select
                          value={field.type}
                          onChange={(e) => {
                            const fields = [...form.fields];
                            fields[index] = { ...field, type: e.target.value };
                            setForm({ ...form, fields });
                          }}
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type} value={type}>{FIELD_TYPE_LABEL[type]}</option>
                          ))}
                        </Select>
                      </Field>
                      <label className="flex items-center gap-1.5 pb-2 text-[11px] text-slate-600">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-navy-700"
                          checked={field.isRequired}
                          onChange={(e) => {
                            const fields = [...form.fields];
                            fields[index] = { ...field, isRequired: e.target.checked };
                            setForm({ ...form, fields });
                          }}
                        />
                        Wajib
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 rounded border-slate-300 text-navy-700"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              Template aktif (dapat digunakan pembuat surat)
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal open={preview !== null} onClose={() => setPreview(null)} size="xl" title="Pratinjau template" description={preview?.name}>
        {preview ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {preview.fields.map((field) => (
                <span key={field.key} className={cn("rounded-full bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600", field.isRequired && "bg-amber-50 text-amber-700")}>
                  {`{{${field.key}}}`} {field.isRequired ? "· wajib" : ""}
                </span>
              ))}
            </div>
            <div className="bg-slate-50 p-3">
              <LetterPreview
                showActions={false}
                data={{
                  kopText: preview.kopText,
                  number: "001/XX/ORG/I/2026",
                  date: new Date().toISOString().slice(0, 10),
                  title: preview.fields.find((f) => f.key === "perihal")?.label ?? "Contoh Perihal",
                  recipientName: "[Nama Penerima]",
                  recipientPosition: "[Jabatan Penerima]",
                  recipientAddress: "[Alamat Penerima]",
                  bodyText: (preview.bodyTemplate ?? "").replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => `[${labelFor(key)}]`),
                  signerName: preview.signerName,
                  signerPosition: preview.signerPosition,
                  classification: "biasa",
                  attachments: [],
                  ready: false,
                }}
              />
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
