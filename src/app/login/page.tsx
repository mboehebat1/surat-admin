"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, FileText, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Button, Field, Input, ToastProvider, useToast } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/status";

const DEMO_ACCOUNTS = [
  { role: "super_admin", email: "superadmin@esurat.local", name: "Andi Pratama", desc: "Kelola pengguna, template, alur, audit" },
  { role: "admin_persuratan", email: "admin@esurat.local", name: "Siti Rahmawati", desc: "Kelola surat, nomor, distribusi, arsip" },
  { role: "pembuat_surat", email: "pembuat@esurat.local", name: "Budi Santoso", desc: "Buat & ajukan surat dari template" },
  { role: "pemeriksa", email: "pemeriksa@esurat.local", name: "Dewi Lestari", desc: "Periksa & kembalikan untuk revisi" },
  { role: "pejabat", email: "pejabat@esurat.local", name: "Dr. Ahmad Fauzi", desc: "Setujui / tolak surat" },
];

const DEMO_PASSWORD = "surat123";

export default function LoginPage() {
  return (
    <ToastProvider>
      <LoginForm />
    </ToastProvider>
  );
}

function LoginForm() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const result = await api<{ user: { name: string; roleCode: string } }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast.push("success", `Selamat datang, ${result.data.user.name}.`);
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-navy-950 p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 22%, rgba(96,144,250,0.45), transparent 42%), radial-gradient(circle at 82% 78%, rgba(37,80,235,0.4), transparent 45%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold tracking-widest">E-SURAT</p>
            <p className="text-[11px] text-slate-300">Sistem Informasi Manajemen Persuratan Digital</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-semibold leading-tight">
            Seluruh proses surat organisasi Anda, dari pembuatan hingga arsip.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Template dinamis dengan deteksi placeholder otomatis, alur persetujuan bertingkat yang dapat
            dikonfigurasi, penomoran surat otomatis, ekspor DOCX &amp; PDF, monitoring waktu nyata, arsip digital,
            laporan statistik, dan jejak audit yang tidak dapat diubah pengguna.
          </p>
          <ul className="mt-8 grid gap-3 text-sm text-slate-200">
            {[
              "5 level pengguna dengan hak akses berbasis peran",
              "10 status surat dan riwayat persetujuan setiap siklus",
              "Notifikasi otomatis di setiap perubahan tahap",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-slate-400">
          Persetujuan digital dalam sistem ini merekam identitas, waktu, dan jejak audit — bukan tanda tangan
          elektronik tersertifikasi (PSrE).
        </p>
      </div>

      <div className="flex flex-col justify-center bg-white px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-6 lg:hidden">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-navy-950 text-white">
              <FileText className="h-5 w-5" />
            </span>
          </div>
          <h2 className="text-2xl font-semibold text-slate-900">Masuk ke sistem</h2>
          <p className="mt-1 text-sm text-slate-500">
            Gunakan akun yang terdaftar. Setiap peran memiliki dashboard dan hak akses berbeda.
          </p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  required
                  autoComplete="username"
                  className="pl-9"
                  placeholder="nama@esurat.local"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
            </Field>
            <Field label="Kata Sandi">
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  className="pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
            </Field>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" className="w-full" loading={loading} icon={<ArrowRight className="h-4 w-4" />}>
              Masuk
            </Button>
          </form>

          <div className="mt-8">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Akun demonstrasi</p>
            <div className="mt-2 space-y-1.5">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(DEMO_PASSWORD);
                    setError(null);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors hover:border-navy-300 hover:bg-navy-50/50"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">
                    {account.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">{ROLE_LABEL[account.role]}</span>
                    <span className="block truncate text-[11px] text-slate-500">{account.email} · {account.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Loader2 className="hidden" /> Kata sandi semua akun demonstrasi: <span className="font-semibold text-slate-600">{DEMO_PASSWORD}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
