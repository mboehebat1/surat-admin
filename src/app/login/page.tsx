"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, FileText, Lock, Mail, Megaphone, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, Field, Input, ToastProvider, useToast } from "@/components/ui";
import { formatDateID } from "@/lib/status";
import { announcementCategoryLabel, announcementCategoryTone } from "@/lib/announcement-meta";

type AnnouncementDto = {
  id: number;
  title: string;
  body: string;
  category: string;
  isPinned: boolean;
  publishedAt: string;
};

function NewsBoard() {
  const [items, setItems] = useState<AnnouncementDto[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await api<{ items: AnnouncementDto[] }>("/api/announcements?limit=4");
      if (!alive) return;
      setItems(result.ok ? result.data.items : []);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2">
        <Megaphone className="h-3.5 w-3.5 text-navy-600" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Berita terkini</p>
      </div>

      {items === null ? (
        <div className="mt-2 space-y-2" aria-label="Memuat berita">
          {[0, 1].map((key) => (
            <div key={key} className="h-14 animate-pulse rounded-lg border border-slate-100 bg-slate-50" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-4 text-[11px] text-slate-400">
          Belum ada berita atau pengumuman. Super Admin dapat menambahkannya melalui menu Berita &amp; Pengumuman di
          dasbor.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{item.title}</p>
                <Badge className={announcementCategoryTone(item.category)}>
                  {announcementCategoryLabel(item.category)}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{item.body}</p>
              <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
                <CalendarDays className="h-3 w-3" />
                {formatDateID(item.publishedAt)}
                {item.isPinned ? <span className="ml-1 font-semibold text-navy-600">• Disematkan</span> : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

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

          <NewsBoard />
        </div>
      </div>
    </div>
  );
}
