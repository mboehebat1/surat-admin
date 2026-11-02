"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FilePlus2,
  FileText,
  GitBranch,
  Loader2,
  Paperclip,
  Save,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { api } from "@/lib/client";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";
import { LetterPreview } from "@/components/letter-preview";
import { FIELD_TYPE_LABEL, formatDateID, formatBytes } from "@/lib/status";

type FieldDto = {
  id: number;
  key: string;
  label: string;
  type: string;
  options: string[] | null;
  isRequired: boolean;
  defaultValue: string | null;
  placeholder: string | null;
  helpText: string | null;
  sortOrder: number;
};

type TemplateDto = {
  id: number;
  name: string;
  code: string;
  categoryId: number | null;
  categoryName: string | null;
  isActive: boolean;
  bodyTemplate: string | null;
  kopText: string | null;
  signerName: string | null;
  signerPosition: string | null;
  numberingFormat: string | null;
  fields: FieldDto[];
};

type CategoryDto = { id: number; code: string; name: string; description: string | null; direction: string };
type WorkflowDto = { id: number; name: string; code: string; categoryId: number | null; isDefault: boolean; isActive: boolean; steps: { label: string; roleCode: string; slaHours: number }[] };
type AttachmentDto = { id: number; originalName: string; sizeBytes: number; mimeType: string | null };

const CORE_KEYS = [
  "nomor_surat",
  "tanggal_surat",
  "nama_penerima",
  "jabatan_penerima",
  "alamat_penerima",
  "alamat",
  "perihal",
  "isi_surat",
];

function renderBody(template: string | null | undefined, values: Record<string, string>): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_m, key: string) => values[key] ?? "");
}

export function LetterWizard({ letterId }: { letterId?: number }) {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(letterId ? 1 : 0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowDto[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(letterId ?? null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [classification, setClassification] = useState("biasa");
  const [priority, setPriority] = useState("normal");
  const [attachments, setAttachments] = useState<AttachmentDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [letterStatus, setLetterStatus] = useState<string>("draft");

  const pendingFiles = useRef<File[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creating = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const template = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);
  const dynamicFields = useMemo(
    () => (template?.fields ?? []).filter((field) => !CORE_KEYS.includes(field.key)).sort((a, b) => a.sortOrder - b.sortOrder),
    [template],
  );
  const workflow = useMemo(() => {
    if (!template) return null;
    return (
      workflows.find((w) => w.isActive && w.categoryId === template.categoryId) ??
      workflows.find((w) => w.isActive && w.isDefault) ??
      workflows.find((w) => w.isActive) ??
      null
    );
  }, [workflows, template]);

  const setValue = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  /* ------------------------------ loading ----------------------------- */
  useEffect(() => {
    let active = true;
    const load = async () => {
      const [categoryRes, templateRes, workflowRes] = await Promise.all([
        api<{ items: CategoryDto[] }>("/api/categories"),
        api<{ items: TemplateDto[] }>("/api/templates?active=1"),
        api<{ items: WorkflowDto[] }>("/api/workflows"),
      ]);
      if (!active) return;
      if (categoryRes.ok) setCategories(categoryRes.data.items);
      if (templateRes.ok) setTemplates(templateRes.data.items);
      if (workflowRes.ok) setWorkflows(workflowRes.data.items);

      if (letterId) {
        const detail = await api<{
          letter: { id: number; templateId: number | null; data: Record<string, string>; title: string; recipientName: string | null; recipientPosition: string | null; recipientAddress: string | null; letterDate: string | null; classification: string; priority: string; status: string };
          attachments: AttachmentDto[];
        }>(`/api/letters/${letterId}`);
        if (detail.ok) {
          const letter = detail.data.letter;
          setTemplateId(letter.templateId);
          setValues({
            ...(letter.data ?? {}),
            perihal: (letter.data?.perihal as string) || letter.title || "",
            nama_penerima: (letter.data?.nama_penerima as string) || letter.recipientName || "",
            jabatan_penerima: (letter.data?.jabatan_penerima as string) || letter.recipientPosition || "",
            alamat_penerima: (letter.data?.alamat_penerima as string) || letter.recipientAddress || "",
            tanggal_surat: (letter.data?.tanggal_surat as string) || letter.letterDate || new Date().toISOString().slice(0, 10),
          });
          setClassification(letter.classification ?? "biasa");
          setPriority(letter.priority ?? "normal");
          setAttachments(detail.data.attachments);
          setLetterStatus(letter.status);
        } else {
          toast.push("error", detail.error);
        }
      } else {
        setValues((current) => ({
          tanggal_surat: new Date().toISOString().slice(0, 10),
          ...current,
        }));
      }
      setLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterId]);

  /* ------------------------------ validation -------------------------- */
  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!templateId) next.templateId = "Pilih template terlebih dahulu.";
    const requiredKeys = ["perihal", "nama_penerima", "tanggal_surat", ...(template?.fields.filter((f) => f.isRequired).map((f) => f.key) ?? [])];
    for (const key of requiredKeys) {
      if (key === "nomor_surat") continue;
      const value = values[key];
      if (!value || !String(value).trim()) next[key] = `${template?.fields.find((f) => f.key === key)?.label ?? key} wajib diisi.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [templateId, template, values]);

  /* ------------------------------- autosave --------------------------- */
  const persist = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!templateId) return null;
      setSaving(true);
      try {
        const payload = {
          templateId,
          title: values.perihal?.trim() || "Tanpa perihal",
          recipientName: values.nama_penerima?.trim() || "Penerima",
          recipientPosition: values.jabatan_penerima?.trim() || null,
          recipientAddress: values.alamat_penerima?.trim() || null,
          letterDate: values.tanggal_surat || new Date().toISOString().slice(0, 10),
          classification,
          priority,
          data: values,
        };

        if (!currentId) {
          if (creating.current) return null;
          creating.current = true;
          const created = await api<{ item: { id: number } }>("/api/letters", { method: "POST", body: payload });
          creating.current = false;
          if (!created.ok) {
            if (!options.silent) toast.push("error", created.error);
            return null;
          }
          setCurrentId(created.data.item.id);
          if (pendingFiles.current.length) {
            const form = new FormData();
            pendingFiles.current.forEach((file) => form.append("files", file));
            pendingFiles.current = [];
            const upload = await api<{ items: AttachmentDto[] }>(`/api/letters/${created.data.item.id}/attachments`, {
              method: "POST",
              body: form,
            });
            if (upload.ok) setAttachments(upload.data.items);
          }
          setLastSaved(new Date().toLocaleTimeString("id-ID"));
          if (!options.silent) toast.push("success", "Draft surat tersimpan.");
          return created.data.item.id;
        }

        const updated = await api(`/api/letters/${currentId}`, { method: "PATCH", body: payload });
        if (!updated.ok) {
          if (!options.silent) toast.push("error", updated.error);
          return null;
        }
        setLastSaved(new Date().toLocaleTimeString("id-ID"));
        if (!options.silent) toast.push("success", "Perubahan tersimpan.");
        return currentId;
      } finally {
        setSaving(false);
      }
    },
    [templateId, values, classification, priority, currentId, toast],
  );

  useEffect(() => {
    if (step < 1 || !templateId) return;
    if (!values.perihal && !values.nama_penerima) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist({ silent: true }), 2500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [step, templateId, values, persist]);

  /* ------------------------------ attachments ------------------------- */
  const onFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!currentId) {
      pendingFiles.current.push(...Array.from(files));
      toast.push("info", `${files.length} berkas disiapkan dan akan terunggah saat draft tersimpan.`);
      const id = await persist({ silent: true });
      if (!id) return;
      return;
    }
    const form = new FormData();
    Array.from(files).forEach((file) => form.append("files", file));
    const result = await api<{ items: AttachmentDto[] }>(`/api/letters/${currentId}/attachments`, { method: "POST", body: form });
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    setAttachments((current) => [...current, ...result.data.items]);
    toast.push("success", `${result.data.items.length} lampiran diunggah.`);
  };

  const removeAttachment = async (id: number) => {
    if (!currentId) return;
    const result = await api(`/api/letters/${currentId}/attachments/${id}`, { method: "DELETE" });
    if (result.ok) {
      setAttachments((current) => current.filter((item) => item.id !== id));
      toast.push("success", "Lampiran dihapus.");
    } else toast.push("error", result.error);
  };

  /* -------------------------------- submit ---------------------------- */
  const submitLetter = async () => {
    if (!validate()) {
      toast.push("error", "Lengkapi field wajib sebelum mengirim pengajuan.");
      setStep(1);
      return;
    }
    const id = await persist();
    if (!id) return;
    setBusy("submit");
    const result = await api<{ status: string }>(`/api/letters/${id}/action`, {
      method: "POST",
      body: { action: "submit" },
    });
    setBusy(null);
    if (!result.ok) {
      toast.push("error", result.error);
      return;
    }
    toast.push("success", "Surat berhasil diajukan ke tahap pemeriksaan.");
    router.push(`/surat/${id}`);
    router.refresh();
  };

  const saveDraft = async () => {
    setBusy("draft");
    const id = await persist();
    setBusy(null);
    if (id) {
      toast.push("success", "Draft tersimpan. Anda dapat melanjutkannya kapan saja.");
      router.push(`/surat/${id}`);
      router.refresh();
    }
  };

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3 p-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat template dan alur persetujuan…
        </div>
      </Card>
    );
  }

  const steps = ["Pilih Template", "Isi Data Surat", "Pratinjau & Kirim"];
  const previewData = {
    kopText: template?.kopText,
    number: values.nomor_surat || null,
    date: values.tanggal_surat,
    title: values.perihal,
    recipientName: values.nama_penerima,
    recipientPosition: values.jabatan_penerima,
    recipientAddress: values.alamat_penerima,
    bodyText: values.isi_surat ? renderBody(template?.bodyTemplate, values) : renderBody(template?.bodyTemplate, values),
    signerName: template?.signerName,
    signerPosition: template?.signerPosition,
    classification,
    attachments,
    letterId: currentId,
    ready: false,
  };

  const visibleTemplates = templates.filter((t) => (categories.length ? true : true));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex flex-wrap items-center gap-2">
          {steps.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => index <= step && setStep(index)}
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  index === step ? "bg-navy-900 text-white" : index < step ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500",
                )}
              >
                <span className="grid h-5 w-5 place-items-center rounded-full bg-white/20 text-[10px]">
                  {index < step ? <Check className="h-3 w-3" /> : index + 1}
                </span>
                {label}
              </button>
              {index < steps.length - 1 ? <ArrowRight className="h-3.5 w-3.5 text-slate-300" /> : null}
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : lastSaved ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Menyimpan otomatis…" : lastSaved ? `Draft tersimpan otomatis ${lastSaved}` : "Auto-save aktif"}
          {currentId ? (
            <Link href={`/surat/${currentId}`} className="font-medium text-navy-700 hover:underline">
              · Buka surat #{currentId}
            </Link>
          ) : null}
        </div>
      </div>

      {step === 0 ? (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="1. Pilih kategori surat"
              subtitle="Kategori menentukan alur persetujuan dan format penomoran"
              icon={<FileText className="h-4 w-4" />}
            />
            <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {categories.map((category) => {
                const count = visibleTemplates.filter((t) => t.categoryId === category.id).length;
                return (
                  <div key={category.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{category.name}</p>
                      <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{category.code}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{category.description ?? "-"}</p>
                    <p className="mt-2 text-[11px] text-slate-400">
                      {count} template aktif · arah {category.direction}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="2. Pilih template surat"
              subtitle="Field formulir dibuat otomatis dari placeholder {{…}}, <<…>>, ${…}, atau [field] yang terdeteksi pada template"
              icon={<FilePlus2 className="h-4 w-4" />}
            />
            {visibleTemplates.length === 0 ? (
              <EmptyState
                title="Belum ada template aktif"
                description="Admin Persuratan perlu menambahkan template terlebih dahulu."
                action={
                  <Link href="/template">
                    <Button variant="outline" size="sm">
                      Kelola template
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleTemplates.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTemplateId(item.id);
                      setValues((current) => {
                        const next = { ...current };
                        item.fields.forEach((field) => {
                          if (!next[field.key] && field.defaultValue) next[field.key] = field.defaultValue;
                        });
                        if (!next.tanggal_surat) next.tanggal_surat = new Date().toISOString().slice(0, 10);
                        return next;
                      });
                      setStep(1);
                    }}
                    className={cn(
                      "rounded-lg border p-4 text-left transition-all hover:border-navy-400 hover:shadow-sm",
                      templateId === item.id ? "border-navy-600 bg-navy-50/60 ring-2 ring-navy-100" : "border-slate-200 bg-white",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
                      <Badge
                        className={
                          item.categoryName
                            ? "bg-navy-50 text-navy-700 ring-navy-200"
                            : "bg-slate-100 text-slate-500 ring-slate-200"
                        }
                      >
                        {item.categoryName ?? "Tanpa kategori"}
                      </Badge>
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-slate-400">{item.code}</p>
                    <p className="mt-2 text-[11px] text-slate-500">
                      {item.fields.length} field otomatis · {item.bodyTemplate ? "naskah template tersedia" : "tanpa naskah bawaan"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.fields.slice(0, 5).map((field) => (
                        <span key={field.key} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                          {`{{${field.key}}}`}
                        </span>
                      ))}
                      {item.fields.length > 5 ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">+{item.fields.length - 5}</span>
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {step === 1 && template ? (
        <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader
                title="Informasi utama surat"
                subtitle={`Template: ${template.name}`}
                action={
                  <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => setStep(0)}>
                    Ganti template
                  </Button>
                }
              />
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <Field label="Perihal surat" required error={errors.perihal} className="sm:col-span-2">
                  <Input value={values.perihal ?? ""} onChange={(e) => setValue("perihal", e.target.value)} placeholder="Contoh: Permohonan Peminjaman Aula" />
                </Field>
                <Field label="Tanggal surat" required error={errors.tanggal_surat}>
                  <Input type="date" value={values.tanggal_surat ?? ""} onChange={(e) => setValue("tanggal_surat", e.target.value)} />
                </Field>
                <Field label="Nomor surat" hint="Diisi otomatis setelah persetujuan akhir">
                  <Input value={values.nomor_surat ?? ""} readOnly placeholder="(otomatis)" />
                </Field>
                <Field label="Nama penerima / tujuan" required error={errors.nama_penerima}>
                  <Input value={values.nama_penerima ?? ""} onChange={(e) => setValue("nama_penerima", e.target.value)} placeholder="Contoh: Kepala Bagian Umum" />
                </Field>
                <Field label="Jabatan penerima">
                  <Input value={values.jabatan_penerima ?? ""} onChange={(e) => setValue("jabatan_penerima", e.target.value)} />
                </Field>
                <Field label="Alamat penerima" className="sm:col-span-2">
                  <Textarea value={values.alamat_penerima ?? values.alamat ?? ""} onChange={(e) => setValue("alamat_penerima", e.target.value)} className="min-h-[64px]" />
                </Field>
                <Field label="Klasifikasi">
                  <Select value={classification} onChange={(e) => setClassification(e.target.value)}>
                    <option value="biasa">Biasa</option>
                    <option value="penting">Penting</option>
                    <option value="segera">Segera</option>
                    <option value="rahasia">Rahasia</option>
                  </Select>
                </Field>
                <Field label="Prioritas">
                  <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="tinggi">Tinggi</option>
                    <option value="mendesak">Mendesak</option>
                  </Select>
                </Field>
                <Field label="Isi surat / naskah utama" required error={errors.isi_surat} className="sm:col-span-2" hint="Bagian {{isi_surat}} pada template akan digantikan teks ini.">
                  <Textarea className="min-h-[150px]" value={values.isi_surat ?? ""} onChange={(e) => setValue("isi_surat", e.target.value)} placeholder="Tulis uraian pokok surat…" />
                </Field>
              </div>
            </Card>

            <Card>
              <CardHeader
                title={`Field otomatis dari template (${dynamicFields.length})`}
                subtitle="Dideteksi dari placeholder dokumen DOCX / naskah template"
              />
              {dynamicFields.length === 0 ? (
                <EmptyState title="Tidak ada field tambahan" description="Template ini hanya memakai field inti surat." />
              ) : (
                <div className="grid gap-4 p-4 sm:grid-cols-2">
                  {dynamicFields.map((field) => (
                    <Field
                      key={field.key}
                      label={`${field.label} (${FIELD_TYPE_LABEL[field.type] ?? field.type})`}
                      required={field.isRequired}
                      error={errors[field.key]}
                      hint={field.helpText ?? undefined}
                      className={field.type === "textarea" ? "sm:col-span-2" : undefined}
                    >
                      {field.type === "textarea" ? (
                        <Textarea value={values[field.key] ?? ""} onChange={(e) => setValue(field.key, e.target.value)} placeholder={field.placeholder ?? undefined} />
                      ) : field.type === "select" ? (
                        <Select value={values[field.key] ?? ""} onChange={(e) => setValue(field.key, e.target.value)}>
                          <option value="">— pilih —</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : "text"}
                          value={values[field.key] ?? ""}
                          onChange={(e) => setValue(field.key, e.target.value)}
                          placeholder={field.placeholder ?? undefined}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Dokumen pendukung" subtitle="Unggah lampiran (DOCX, PDF, XLSX, gambar, ZIP — maks. 10 MB per berkas)" icon={<Paperclip className="h-4 w-4" />} />
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    className="hidden"
                    accept=".docx,.doc,.pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.zip"
                    onChange={(e) => {
                      void onFilesSelected(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <Button variant="outline" size="sm" icon={<Upload className="h-3.5 w-3.5" />} onClick={() => fileInput.current?.click()}>
                    Pilih berkas
                  </Button>
                  <span className="text-[11px] text-slate-500">{attachments.length} berkas terlampir</span>
                </div>
                {attachments.length ? (
                  <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {attachments.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{item.originalName}</span>
                        <span className="text-[11px] text-slate-400">{formatBytes(item.sizeBytes)}</span>
                        <button type="button" onClick={() => removeAttachment(item.id)} className="text-slate-400 hover:text-red-600" aria-label="Hapus lampiran">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400">
                    Belum ada lampiran.
                  </p>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Alur persetujuan yang berlaku" icon={<GitBranch className="h-4 w-4" />} />
              <div className="p-4">
                {workflow ? (
                  <>
                    <p className="text-sm font-semibold text-slate-900">{workflow.name}</p>
                    <ol className="mt-3 space-y-2">
                      {workflow.steps.map((item, index) => (
                        <li key={item.label} className="flex items-start gap-2">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy-100 text-[10px] font-semibold text-navy-800">
                            {index + 1}
                          </span>
                          <span className="text-xs text-slate-600">
                            <span className="font-medium text-slate-800">{item.label}</span>
                            <span className="block text-[11px] text-slate-400">SLA {item.slaHours} jam · {item.roleCode.replace("_", " ")}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                ) : (
                  <p className="text-xs text-slate-500">Belum ada alur persetujuan aktif.</p>
                )}
                {letterStatus !== "draft" ? (
                  <p className="mt-3 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700">
                    Status surat saat ini: {letterStatus}. Perubahan hanya dapat disimpan bila surat masih Draft/Revisi.
                  </p>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader title="Ringkasan" />
              <dl className="space-y-2 p-4 text-xs">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Template</dt>
                  <dd className="text-right font-medium text-slate-800">{template.name}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Kategori</dt>
                  <dd className="text-right font-medium text-slate-800">{template.categoryName ?? "Tanpa kategori"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Format nomor</dt>
                  <dd className="text-right font-mono text-[11px] text-slate-700">{template.numberingFormat ?? "{nomor}/{kode}/{org}/{bulan}/{tahun}"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Tanggal surat</dt>
                  <dd className="text-right font-medium text-slate-800">{formatDateID(values.tanggal_surat)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Penandatangan</dt>
                  <dd className="text-right font-medium text-slate-800">{template.signerName ?? "-"}</dd>
                </div>
              </dl>
            </Card>

            <Card className="sticky top-20">
              <div className="space-y-2 p-4">
                <Button className="w-full" icon={<ArrowRight className="h-4 w-4" />} onClick={() => { if (validate()) setStep(2); else toast.push("error", "Lengkapi field wajib terlebih dahulu."); }}>
                  Lanjut ke Pratinjau
                </Button>
                <Button variant="outline" className="w-full" loading={busy === "draft"} icon={<Save className="h-4 w-4" />} onClick={saveDraft}>
                  Simpan Draft
                </Button>
                <Button variant="success" className="w-full" loading={busy === "submit"} icon={<Send className="h-4 w-4" />} onClick={submitLetter}>
                  Simpan & Kirim Pengajuan
                </Button>
                {errors.templateId ? <p className="text-[11px] text-red-600">{errors.templateId}</p> : null}
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {step === 2 && template ? (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Pratinjau surat"
              subtitle="Hasil pengisian formulir ke dalam naskah template"
              action={
                <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-3.5 w-3.5" />} onClick={() => setStep(1)}>
                  Kembali ke formulir
                </Button>
              }
            />
            <div className="bg-slate-50 p-4">
              <LetterPreview data={previewData} />
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="text-xs text-slate-500">
                {Object.keys(errors).length ? (
                  <span className="font-medium text-red-600">
                    {Object.keys(errors).length} field wajib belum lengkap.
                  </span>
                ) : (
                  <span className="font-medium text-emerald-600">Semua field wajib telah terisi.</span>
                )}
                {workflow ? <span> · Alur: {workflow.name}</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" loading={busy === "draft"} icon={<Save className="h-4 w-4" />} onClick={saveDraft}>
                  Simpan Draft
                </Button>
                <Button variant="success" loading={busy === "submit"} icon={<Send className="h-4 w-4" />} onClick={submitLetter}>
                  Kirim Pengajuan
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

    </div>
  );
}
