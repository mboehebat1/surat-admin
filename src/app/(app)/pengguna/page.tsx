"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Check, KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Users, X } from "lucide-react";
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
import { PERMISSIONS, ROLE_LABEL, ROLE_PERMISSIONS, formatDateTimeID } from "@/lib/status";

type UserDto = {
  id: number;
  name: string;
  email: string;
  roleCode: string;
  roleLabel: string;
  departmentId: number | null;
  departmentName: string | null;
  position: string | null;
  phone: string | null;
  nip: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  lettersCreated: number;
};

type DepartmentDto = {
  id: number;
  code: string;
  name: string;
  headName: string | null;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  members: number;
  letters: number;
};

type UserForm = {
  id?: number;
  name: string;
  email: string;
  password: string;
  roleCode: string;
  departmentId: string;
  position: string;
  phone: string;
  nip: string;
  isActive: boolean;
};

type DepartmentForm = {
  id?: number;
  code: string;
  name: string;
  headName: string;
  address: string;
  phone: string;
  isActive: boolean;
};

const EMPTY_USER: UserForm = {
  name: "",
  email: "",
  password: "",
  roleCode: "pembuat_surat",
  departmentId: "",
  position: "",
  phone: "",
  nip: "",
  isActive: true,
};

const EMPTY_DEPT: DepartmentForm = { code: "", name: "", headName: "", address: "", phone: "", isActive: true };

export default function UsersPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"pengguna" | "departemen" | "hakakses">("pengguna");
  const [users, setUsers] = useState<UserDto[]>([]);
  const [departments, setDepartments] = useState<DepartmentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserForm | null>(null);
  const [deptForm, setDeptForm] = useState<DepartmentForm | null>(null);
  const [canManage, setCanManage] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [userRes, deptRes, meRes] = await Promise.all([
      api<{ items: UserDto[] }>("/api/users"),
      api<{ items: DepartmentDto[] }>("/api/departments"),
      api<{ user: { permissions: string[] } }>("/api/auth/me"),
    ]);
    if (userRes.ok) setUsers(userRes.data.items);
    else setError(userRes.error);
    if (deptRes.ok) setDepartments(deptRes.data.items);
    if (meRes.ok) setCanManage(meRes.data.user.permissions.includes("pengguna.kelola"));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitUser = async () => {
    if (!userForm) return;
    if (userForm.name.trim().length < 3) return toast.push("error", "Nama minimal 3 karakter.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userForm.email)) return toast.push("error", "Format email tidak valid.");
    if (!userForm.id && userForm.password.length < 6) return toast.push("error", "Kata sandi minimal 6 karakter.");

    const payload: Record<string, unknown> = {
      name: userForm.name.trim(),
      email: userForm.email.trim().toLowerCase(),
      roleCode: userForm.roleCode,
      departmentId: userForm.departmentId ? Number(userForm.departmentId) : null,
      position: userForm.position.trim() || null,
      phone: userForm.phone.trim() || null,
      nip: userForm.nip.trim() || null,
      isActive: userForm.isActive,
    };
    if (userForm.password) payload.password = userForm.password;

    setSaving(true);
    const result = await api(userForm.id ? `/api/users/${userForm.id}` : "/api/users", {
      method: userForm.id ? "PATCH" : "POST",
      body: payload,
    });
    setSaving(false);
    if (!result.ok) return toast.push("error", result.error);
    toast.push("success", userForm.id ? "Data pengguna diperbarui." : "Pengguna baru ditambahkan.");
    setUserForm(null);
    void load();
  };

  const submitDept = async () => {
    if (!deptForm) return;
    if (deptForm.name.trim().length < 3) return toast.push("error", "Nama departemen minimal 3 karakter.");
    if (!deptForm.code.trim()) return toast.push("error", "Kode departemen wajib diisi.");

    setSaving(true);
    const result = await api(deptForm.id ? `/api/departments/${deptForm.id}` : "/api/departments", {
      method: deptForm.id ? "PATCH" : "POST",
      body: {
        code: deptForm.code.trim().toUpperCase(),
        name: deptForm.name.trim(),
        headName: deptForm.headName.trim() || null,
        address: deptForm.address.trim() || null,
        phone: deptForm.phone.trim() || null,
        isActive: deptForm.isActive,
      },
    });
    setSaving(false);
    if (!result.ok) return toast.push("error", result.error);
    toast.push("success", deptForm.id ? "Departemen diperbarui." : "Departemen ditambahkan.");
    setDeptForm(null);
    void load();
  };

  const toggleUser = async (user: UserDto) => {
    setBusyId(`user-${user.id}`);
    const result = await api(`/api/users/${user.id}`, { method: "PATCH", body: { isActive: !user.isActive } });
    setBusyId(null);
    if (result.ok) {
      toast.push("success", `Akun ${user.isActive ? "dinonaktifkan" : "diaktifkan"}.`);
      void load();
    } else toast.push("error", result.error);
  };

  const removeUser = async (user: UserDto) => {
    setBusyId(`user-${user.id}`);
    const result = await api(`/api/users/${user.id}`, { method: "DELETE" });
    setBusyId(null);
    if (result.ok) {
      toast.push("success", "Akun dihapus.");
      void load();
    } else toast.push("error", result.error);
  };

  const removeDept = async (department: DepartmentDto) => {
    setBusyId(`dept-${department.id}`);
    const result = await api(`/api/departments/${department.id}`, { method: "DELETE" });
    setBusyId(null);
    if (result.ok) {
      toast.push("success", "Departemen dihapus/dinonaktifkan.");
      void load();
    } else toast.push("error", result.error);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Administrasi Pengguna &amp; Hak Akses</h1>
          <p className="mt-1 text-sm text-slate-500">
            Kelola akun, peran, departemen, dan matriks hak akses sistem.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()}>
            Segarkan
          </Button>
          {canManage && tab === "pengguna" ? (
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setUserForm({ ...EMPTY_USER })}>
              Tambah Pengguna
            </Button>
          ) : null}
          {canManage && tab === "departemen" ? (
            <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setDeptForm({ ...EMPTY_DEPT })}>
              Tambah Departemen
            </Button>
          ) : null}
        </div>
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "pengguna", label: "Pengguna", count: users.length },
          { value: "departemen", label: "Departemen", count: departments.length },
          { value: "hakakses", label: "Matriks Hak Akses" },
        ]}
      />

      {loading ? (
        <Card>
          <LoadingRows rows={6} />
        </Card>
      ) : error ? (
        <Card>
          <EmptyState title="Gagal memuat data" description={error} action={<Button size="sm" onClick={() => void load()}>Coba lagi</Button>} />
        </Card>
      ) : tab === "pengguna" ? (
        <Card>
          <CardHeader title="Daftar pengguna" subtitle={`${users.length} akun terdaftar`} icon={<Users className="h-4 w-4" />} />
          <Table>
            <THead>
              <tr>
                <TH>Nama</TH>
                <TH>Peran</TH>
                <TH>Departemen</TH>
                <TH>Surat dibuat</TH>
                <TH>Masuk terakhir</TH>
                <TH>Status</TH>
                <TH className="text-right">Aksi</TH>
              </tr>
            </THead>
            <TBody>
              {users.map((user) => (
                <TR key={user.id}>
                  <TD>
                    <span className="block text-sm font-medium text-slate-900">{user.name}</span>
                    <span className="block text-[11px] text-slate-400">{user.email}</span>
                    {user.position ? <span className="block text-[11px] text-slate-500">{user.position}</span> : null}
                  </TD>
                  <TD>
                    <Badge className="bg-navy-50 text-navy-800 ring-navy-200">{user.roleLabel}</Badge>
                  </TD>
                  <TD className="text-xs">{user.departmentName ?? "-"}</TD>
                  <TD className="text-xs tabular-nums">{user.lettersCreated}</TD>
                  <TD className="text-[11px] text-slate-500">{user.lastLoginAt ? formatDateTimeID(user.lastLoginAt) : "belum pernah"}</TD>
                  <TD>
                    <Badge className={user.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : "bg-slate-100 text-slate-500 ring-slate-300"}>
                      {user.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {canManage ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Pencil className="h-3.5 w-3.5" />}
                            title="Ubah"
                            onClick={() =>
                              setUserForm({
                                id: user.id,
                                name: user.name,
                                email: user.email,
                                password: "",
                                roleCode: user.roleCode,
                                departmentId: user.departmentId ? String(user.departmentId) : "",
                                position: user.position ?? "",
                                phone: user.phone ?? "",
                                nip: user.nip ?? "",
                                isActive: user.isActive,
                              })
                            }
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            loading={busyId === `user-${user.id}`}
                            icon={<KeyRound className="h-3.5 w-3.5" />}
                            title="Nonaktifkan / aktifkan"
                            onClick={() => toggleUser(user)}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            title="Hapus"
                            onClick={() => removeUser(user)}
                          />
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400">hanya baca</span>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : tab === "departemen" ? (
        <Card>
          <CardHeader title="Daftar departemen / unit kerja" subtitle={`${departments.length} unit terdaftar`} icon={<Building2 className="h-4 w-4" />} />
          <Table>
            <THead>
              <tr>
                <TH>Kode</TH>
                <TH>Nama unit</TH>
                <TH>Kepala unit</TH>
                <TH>Anggota</TH>
                <TH>Surat</TH>
                <TH>Status</TH>
                <TH className="text-right">Aksi</TH>
              </tr>
            </THead>
            <TBody>
              {departments.map((department) => (
                <TR key={department.id}>
                  <TD className="font-mono text-xs">{department.code}</TD>
                  <TD className="text-xs font-medium text-slate-800">
                    {department.name}
                    <span className="block text-[11px] font-normal text-slate-400">{department.address ?? "-"}</span>
                  </TD>
                  <TD className="text-xs">{department.headName ?? "-"}</TD>
                  <TD className="text-xs tabular-nums">{department.members}</TD>
                  <TD className="text-xs tabular-nums">{department.letters}</TD>
                  <TD>
                    <Badge className={department.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-300" : "bg-slate-100 text-slate-500 ring-slate-300"}>
                      {department.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      {canManage ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<Pencil className="h-3.5 w-3.5" />}
                            onClick={() =>
                              setDeptForm({
                                id: department.id,
                                code: department.code,
                                name: department.name,
                                headName: department.headName ?? "",
                                address: department.address ?? "",
                                phone: department.phone ?? "",
                                isActive: department.isActive,
                              })
                            }
                          />
                          <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" loading={busyId === `dept-${department.id}`} icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => removeDept(department)} />
                        </>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Matriks hak akses berbasis peran" subtitle="Setiap endpoint API divalidasi terhadap izin berikut" icon={<ShieldCheck className="h-4 w-4" />} />
          <Table>
            <THead>
              <tr>
                <TH>Izin</TH>
                {Object.keys(ROLE_LABEL).map((code) => (
                  <TH key={code} className="text-center">{ROLE_LABEL[code]}</TH>
                ))}
              </tr>
            </THead>
            <TBody>
              {PERMISSIONS.map((permission) => (
                <TR key={permission.code}>
                  <TD className="text-xs">
                    <span className="font-medium text-slate-800">{permission.name}</span>
                    <span className="block font-mono text-[10px] text-slate-400">{permission.code}</span>
                  </TD>
                  {Object.keys(ROLE_LABEL).map((code) => {
                    const granted = (ROLE_PERMISSIONS[code] ?? []).includes(permission.code);
                    return (
                      <TD key={code} className="text-center">
                        <span className={cn("inline-grid h-5 w-5 place-items-center rounded-full", granted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-300")}>
                          {granted ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </span>
                      </TD>
                    );
                  })}
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <Modal
        open={userForm !== null}
        onClose={() => setUserForm(null)}
        size="lg"
        title={userForm?.id ? "Ubah pengguna" : "Tambah pengguna"}
        description="Peran menentukan dashboard, menu, dan kewenangan tindakan pada surat."
        footer={
          <>
            <Button variant="outline" onClick={() => setUserForm(null)}>Batal</Button>
            <Button loading={saving} onClick={submitUser}>Simpan pengguna</Button>
          </>
        }
      >
        {userForm ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nama lengkap" required>
              <Input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
            </Field>
            <Field label={userForm.id ? "Kata sandi baru (opsional)" : "Kata sandi"} required={!userForm.id} hint={userForm.id ? "Kosongkan bila tidak diganti" : "Minimal 6 karakter"}>
              <Input type="password" value={userForm.password} onChange={(e) => setUserForm({ ...userForm, password: e.target.value })} />
            </Field>
            <Field label="Peran" required>
              <Select value={userForm.roleCode} onChange={(e) => setUserForm({ ...userForm, roleCode: e.target.value })}>
                {Object.entries(ROLE_LABEL).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Departemen">
              <Select value={userForm.departmentId} onChange={(e) => setUserForm({ ...userForm, departmentId: e.target.value })}>
                <option value="">Tanpa departemen</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Jabatan">
              <Input value={userForm.position} onChange={(e) => setUserForm({ ...userForm, position: e.target.value })} />
            </Field>
            <Field label="NIP / NIK">
              <Input value={userForm.nip} onChange={(e) => setUserForm({ ...userForm, nip: e.target.value })} />
            </Field>
            <Field label="Telepon">
              <Input value={userForm.phone} onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-700 sm:col-span-2">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-navy-700" checked={userForm.isActive} onChange={(e) => setUserForm({ ...userForm, isActive: e.target.checked })} />
              Akun aktif (dapat masuk ke sistem)
            </label>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={deptForm !== null}
        onClose={() => setDeptForm(null)}
        title={deptForm?.id ? "Ubah departemen" : "Tambah departemen"}
        footer={
          <>
            <Button variant="outline" onClick={() => setDeptForm(null)}>Batal</Button>
            <Button loading={saving} onClick={submitDept}>Simpan departemen</Button>
          </>
        }
      >
        {deptForm ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Kode" required>
              <Input value={deptForm.code} disabled={Boolean(deptForm.id)} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })} maxLength={10} />
            </Field>
            <Field label="Nama unit kerja" required>
              <Input value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} />
            </Field>
            <Field label="Nama kepala unit">
              <Input value={deptForm.headName} onChange={(e) => setDeptForm({ ...deptForm, headName: e.target.value })} />
            </Field>
            <Field label="Telepon">
              <Input value={deptForm.phone} onChange={(e) => setDeptForm({ ...deptForm, phone: e.target.value })} />
            </Field>
            <Field label="Alamat / lokasi" className="sm:col-span-2">
              <Textarea className="min-h-[70px]" value={deptForm.address} onChange={(e) => setDeptForm({ ...deptForm, address: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-xs text-slate-700 sm:col-span-2">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300 text-navy-700" checked={deptForm.isActive} onChange={(e) => setDeptForm({ ...deptForm, isActive: e.target.checked })} />
              Departemen aktif
            </label>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
