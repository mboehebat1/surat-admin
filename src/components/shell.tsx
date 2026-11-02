"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  FilePlus2,
  FileText,
  Files,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/client";
import { Badge, Button, cn } from "@/components/ui";
import { formatDateTimeID, ROLE_LABEL } from "@/lib/status";

type ShellUser = {
  id: number;
  name: string;
  email: string;
  roleCode: string;
  roleName: string;
  departmentName: string | null;
  position: string | null;
  permissions: string[];
};

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, any: ["dashboard.lihat"], exact: false },
  { href: "/surat/baru", label: "Buat Surat", icon: FilePlus2, any: ["surat.buat"], exact: true },
  { href: "/surat", label: "Data Surat", icon: Files, any: ["surat.lihat"], exact: true },
  { href: "/persetujuan", label: "Persetujuan", icon: ClipboardCheck, any: ["surat.periksa", "surat.setujui"], exact: false },
  { href: "/monitoring", label: "Monitoring", icon: Activity, any: ["monitoring.lihat"], exact: false },
  { href: "/template", label: "Template Surat", icon: FileText, any: ["template.lihat"], exact: false },
  { href: "/alur", label: "Alur Persetujuan", icon: GitBranch, any: ["alur.kelola"], exact: false },
  { href: "/arsip", label: "Arsip Digital", icon: Archive, any: ["surat.lihat"], exact: false },
  { href: "/laporan", label: "Laporan & Statistik", icon: BarChart3, any: ["laporan.lihat"], exact: false },
  { href: "/pengguna", label: "Pengguna & Departemen", icon: Users, any: ["pengguna.kelola", "departemen.kelola"], exact: false },
  { href: "/audit", label: "Audit Log", icon: ShieldCheck, any: ["audit.lihat"], exact: false },
];

type NotificationItem = {
  id: number;
  title: string;
  message: string;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

function NotificationBell({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const load = async () => {
    const result = await api<{ items: NotificationItem[]; unread: number }>("/api/notifications?limit=8");
    if (result.ok) {
      setItems(result.data.items);
      setUnread(result.data.unread);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const interval = window.setInterval(load, 45000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAll = async () => {
    const result = await api("/api/notifications/read-all", { method: "POST" });
    if (result.ok) {
      setItems((current) => current.map((item) => ({ ...item, isRead: true })));
      setUnread(0);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"
        aria-label="Notifikasi"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="animate-fade-up absolute right-0 z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifikasi</p>
              <p className="text-[11px] text-slate-500">{unread} belum dibaca — {user.name.split(" ")[0]}</p>
            </div>
            <button type="button" onClick={markAll} className="text-[11px] font-medium text-navy-700 hover:underline">
              Tandai semua dibaca
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">Memuat notifikasi…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-slate-400">Belum ada notifikasi.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={async () => {
                    await api(`/api/notifications/${item.id}/read`, { method: "POST" });
                    setItems((current) => current.map((i) => (i.id === item.id ? { ...i, isRead: true } : i)));
                    setUnread((u) => Math.max(0, u - 1));
                    setOpen(false);
                    if (item.link) router.push(item.link);
                  }}
                  className={cn(
                    "flex w-full gap-2 border-b border-slate-100 px-4 py-3 text-left transition-colors hover:bg-slate-50",
                    !item.isRead && "bg-navy-50/40",
                  )}
                >
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.isRead ? "bg-slate-300" : "bg-navy-600")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">{item.title}</span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px] leading-relaxed text-slate-500">{item.message}</span>
                    <span className="mt-1 block text-[10px] text-slate-400">{formatDateTimeID(item.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-200 px-4 py-2.5">
            <Link href="/persetujuan" className="text-[11px] font-medium text-navy-700 hover:underline">
              Lihat semua surat yang butuh tindakan →
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-navy-900 text-[11px] font-semibold text-white">
          {user.name
            .split(" ")
            .slice(0, 2)
            .map((n) => n[0])
            .join("")
            .toUpperCase()}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block truncate text-xs font-semibold text-slate-800">{user.name}</span>
          <span className="block truncate text-[10px] text-slate-500">{ROLE_LABEL[user.roleCode] ?? user.roleName}</span>
        </span>
      </button>
      {open ? (
        <div className="animate-fade-up absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-200 px-4 py-3">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge className="bg-navy-50 text-navy-800 ring-navy-200">{ROLE_LABEL[user.roleCode] ?? user.roleName}</Badge>
              {user.departmentName ? <Badge>{user.departmentName}</Badge> : null}
            </div>
            {user.position ? <p className="mt-2 text-[11px] text-slate-500">{user.position}</p> : null}
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 px-4 py-3 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> Keluar dari sistem
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Sidebar({ user, pathname, mobileOpen, onClose }: { user: ShellUser; pathname: string; mobileOpen: boolean; onClose: () => void }) {
  const items = NAV.filter((item) => item.any.some((permission) => user.permissions.includes(permission)));

  const content = (
    <div className="flex h-full flex-col bg-navy-950 text-slate-300">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
          <FileText className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold tracking-wide text-white">E-SURAT</p>
          <p className="truncate text-[10px] leading-tight text-slate-400">Manajemen Persuratan Digital</p>
        </div>
        <button type="button" onClick={onClose} className="ml-auto text-slate-400 hover:text-white lg:hidden" aria-label="Tutup menu">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors",
                active ? "bg-white text-navy-900 shadow-sm" : "text-slate-300 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-navy-700" : "text-slate-400")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">Masuk sebagai</p>
        <p className="mt-1 truncate text-xs font-semibold text-white">{user.name}</p>
        <p className="truncate text-[11px] text-slate-400">{ROLE_LABEL[user.roleCode] ?? user.roleName}</p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">{content}</aside>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
          <div className="animate-fade-up absolute left-0 top-0 h-full w-72">{content}</div>
        </div>
      ) : null}
    </>
  );
}

export function AppShell({ user, children }: { user: ShellUser; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [term, setTerm] = useState("");

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar user={user} pathname={pathname} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 lg:hidden"
            aria-label="Buka menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          <form
            className="relative hidden max-w-md flex-1 sm:block"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(`/surat?q=${encodeURIComponent(term)}`);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Cari perihal atau nomor surat…"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-navy-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-100"
            />
          </form>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="primary" size="sm" icon={<FilePlus2 className="h-4 w-4" />} onClick={() => router.push("/surat/baru")} className="hidden md:inline-flex">
              Buat Surat
            </Button>
            <NotificationBell user={user} />
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-6">{children}</main>

        <footer className="no-print border-t border-slate-200 px-4 py-4 text-center text-[11px] text-slate-400 lg:px-6">
          E-SURAT — Sistem Informasi Manajemen Persuratan Digital · Persetujuan elektronik bersifat internal, bukan tanda tangan elektronik tersertifikasi.
        </footer>
      </div>
    </div>
  );
}
