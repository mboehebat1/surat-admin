"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, GitBranch, Plus, Power, RefreshCw, Star, Trash2, X } from "lucide-react";
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
  Textarea,
  useToast,
} from "@/components/ui";
import { ROLE, ROLE_LABEL } from "@/lib/status";

type StepDto = { id?: number; label: string; roleCode: string; slaHours: number; description?: string | null; stepOrder?: number };
type WorkflowDto = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  categoryId: number | null;
  categoryName: string | null;
  departmentName: string | null;
  isDefault: boolean;
  isActive: boolean;
  steps: StepDto[];
};
type CategoryDto = { id: number; name: string };

type FormState = {
  id?: number;
  code: string;
  name: string;
  description: string;
  categoryId: string;
  isDefault: boolean;
  isActive: boolean;
  steps: StepDto[];
};

export default function WorkflowPage() {
  const toast = useToast();
  const [items, setItems] = useState<WorkflowDto[]>([]);
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [wfRes, catRes, meRes] = await Promise.all([
      api<{ items: WorkflowDto[] }>("/api/workflows"),
      api<{ items: CategoryDto[] }>("/api/categories"),
      api<{ user: { permissions: string[] } }>("/api/auth/me"),
    ]);
    if (wfRes.ok) setItems(wfRes.data.items);
    else setError(wfRes.error);
    if (catRes.ok) setCategories(catRes.data.items);
    if (meRes.ok) setCanManage(meRes.data.user.permissions.includes("alur.kelola"));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () =>
    setForm({
      code: "",
      name: "",
      description: "",
      categoryId: "",
      isDefault: false,
      isActive: true,
      steps: [{ label: "Pemeriksaan Kelengkapan", roleCode: ROLE.ADMIN, slaHours: 24 }],
    });

  const openEdit = (workflow: WorkflowDto) =>
    setForm({
      id: workflow.id,
      code: workflow.code,
      name: workflow.name,
      description: workflow.description ?? "",
      categoryId: workflow.categoryId ? String(workflow.categoryId) : "",
      isDefault: workflow.isDefault,
      isActive: workflow.isActive,
      steps: workflow.steps.map((step) => ({ label: step.label, roleCode: step.roleCode, slaHours: step.slaHours })),
    });

  const submit = async () => {
    if (!form) return;
    if (form.name.trim().length < 4) return toast.push("error", "Nama alur minimal 4 karakter.");
    if (!form.code.trim()) return toast.push("error", "Kode alur wajib diisi.");
    if (!form.steps.length) return toast.push("error", "Alur minimal memiliki satu tahapan.");
    if (form.steps.some((step) => step.label.trim().length < 3)) return toast.push("error", "Nama tahapan minimal 3 karakter.");

    const payload = {
      code: form.code.trim().toUpperCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      categoryId: form.categoryId ? Number(form.categoryId) : null,
      isDefault: form.isDefault,
      isActive: form.isActive,
      steps: form.steps.map((step) => ({ label: step.label.trim(), roleCode: step.roleCode, slaHours: Number(step.slaHours) || 24 })),
    };

    setSaving(true);
    const result = await api(form.id ? `/api/workflows/${form.id}` : "/api/workflows", {
      method: form.id ? "PATCH" : "POST",
      body: payload,
    });
    setSaving(false);
    if (!result.ok) return toast.push("error", result.error);
    toast.push("success", form.id ? "Alur persetujuan diperbarui." : "Alur persetujuan dibuat.");
    setForm(null);
    void load();
  };

  const toggleActive = async (workflow: WorkflowDto) => {
    setBusyId(workflow.id);
    const result = await api(`/api/workflows/${workflow.id}`, {
      method: "PATCH",
      body: { isActive: !workflow.isActive },
    });
    setBusyId(null);
    if (result.ok) {
      toast.push("success", `Alur ${workflow.isActive ? "dinonaktifkan" : "diaktifkan"}.`);
      void load();
    } else toast.push("error", result.error);
  };

  const remove = async (workflow: WorkflowDto) => {
    setBusyId(workflow.id);
    const result = await api(`/api/workflows/${workflow.id}`, { method: "DELETE" });
    setBusyId(null);
    if (result.ok) {
      toast.push("success", "Alur dihapus.");
      void load();
    } else toast.push("error", result.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Konfigurasi Alur Persetujuan</h1>
          <p className="mt-1 text-sm text-slate-500">
            Setiap jenis surat dapat memiliki alur bertingkat berbeda: Pembuat → Admin Persuratan → Pemeriksa → Pejabat
            Penyetuju.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
            Segarkan
          </Button>
          {canManage ? (
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
              Tambah Alur
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <Card>
          <LoadingRows rows={4} />
        </Card>
      ) : error ? (
        <Card>
          <EmptyState title="Gagal memuat alur" description={error} action={<Button size="sm" onClick={() => void load()}>Coba lagi</Button>} />
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon={<GitBranch className="h-6 w-6" />} title="Belum ada alur persetujuan" description="Buat alur agar surat dapat diajukan." />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((workflow) => (
            <Card key={workflow.id}>
              <CardHeader
                title={workflow.name}
                subtitle={`${workflow.code} · berlaku untuk ${workflow.categoryName ?? "semua kategori"}`}
                icon={<GitBranch className="h-4 w-4" />}
                action={
                  <div className="flex items-center gap-1">
                    {workflow.isDefault ? <Badge className="bg-navy-50 text-navy-800 ring-navy-200"><Star className="h-3 w-3" /> Default</Badge> : null}
                    <Badge className={workflow.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : "bg-slate-100 text-slate-500 ring-slate-300"}>
                      {workflow.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </div>
                }
              />
              <div className="p-4">
                {workflow.description ? <p className="mb-3 text-xs text-slate-500">{workflow.description}</p> : null}
                <ol className="flex flex-wrap items-center gap-2">
                  <li>
                    <Badge className="bg-slate-100 text-slate-700 ring-slate-300">Pembuat Surat</Badge>
                  </li>
                  {workflow.steps.map((step, index) => (
                    <li key={`${step.label}-${index}`} className="flex items-center gap-2">
                      <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                      <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                        <span className="block text-[11px] font-semibold text-slate-800">
                          {index + 1}. {step.label}
                        </span>
                        <span className="block text-[10px] text-slate-500">
                          {ROLE_LABEL[step.roleCode] ?? step.roleCode} · SLA {step.slaHours} jam
                        </span>
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center gap-2">
                    <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                    <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-300">Nomor surat &amp; arsip</Badge>
                  </li>
                </ol>

                {canManage ? (
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                    <Button variant="outline" size="sm" onClick={() => openEdit(workflow)}>
                      Ubah alur
                    </Button>
                    <Button variant="ghost" size="sm" loading={busyId === workflow.id} icon={<Power className="h-3.5 w-3.5" />} onClick={() => toggleActive(workflow)}>
                      {workflow.isActive ? "Nonaktifkan" : "Aktifkan"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => remove(workflow)}>
                      Hapus
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        size="lg"
        title={form?.id ? "Ubah alur persetujuan" : "Tambah alur persetujuan"}
        description="Tahapan dijalankan berurutan; surat hanya dapat diproses oleh peran yang berwenang pada tiap tahap."
        footer={
          <>
            <Button variant="outline" onClick={() => setForm(null)}>Batal</Button>
            <Button loading={saving} onClick={submit}>Simpan alur</Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nama alur" required>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alur Standar Persuratan" />
              </Field>
              <Field label="Kode alur" required>
                <Input value={form.code} disabled={Boolean(form.id)} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="WF-STD" />
              </Field>
              <Field label="Berlaku untuk kategori">
                <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Semua kategori</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Deskripsi">
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-700">Tahapan persetujuan ({form.steps.length})</p>
                <Button
                  variant="outline"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setForm({ ...form, steps: [...form.steps, { label: "", roleCode: ROLE.REVIEWER, slaHours: 24 }] })}
                >
                  Tambah tahap
                </Button>
              </div>
              <div className="space-y-2">
                {form.steps.map((step, index) => (
                  <div key={index} className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-lg border border-slate-200 p-2">
                    <span className="mt-7 grid h-6 w-6 place-items-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">
                      {index + 1}
                    </span>
                    <div className="grid gap-2 sm:grid-cols-[1.6fr_1fr_0.7fr_auto]">
                      <Field label="Nama tahap">
                        <Input
                          value={step.label}
                          onChange={(e) => {
                            const steps = [...form.steps];
                            steps[index] = { ...step, label: e.target.value };
                            setForm({ ...form, steps });
                          }}
                          placeholder="Pemeriksaan Kelengkapan"
                        />
                      </Field>
                      <Field label="Peran berwenang">
                        <Select
                          value={step.roleCode}
                          onChange={(e) => {
                            const steps = [...form.steps];
                            steps[index] = { ...step, roleCode: e.target.value };
                            setForm({ ...form, steps });
                          }}
                        >
                          {Object.entries(ROLE_LABEL).map(([code, label]) => (
                            <option key={code} value={code}>{label}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="SLA (jam)">
                        <Input
                          type="number"
                          min={1}
                          value={step.slaHours}
                          onChange={(e) => {
                            const steps = [...form.steps];
                            steps[index] = { ...step, slaHours: Number(e.target.value) };
                            setForm({ ...form, steps });
                          }}
                        />
                      </Field>
                      <button
                        type="button"
                        className="mt-6 grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                        onClick={() => setForm({ ...form, steps: form.steps.filter((_, i) => i !== index) })}
                        aria-label="Hapus tahap"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-navy-700" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
                Jadikan alur default
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-navy-700" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Alur aktif
              </label>
            </div>

          </div>
        ) : null}
      </Modal>
    </div>
  );
}
