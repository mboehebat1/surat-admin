"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

/* ================================ utils =============================== */

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/* ================================ Button ============================== */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success" | "warning";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
};

const BUTTON_VARIANT: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 focus-visible:ring-navy-500 shadow-sm",
  secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200 focus-visible:ring-slate-400",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-300",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400 shadow-sm",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-400 shadow-sm",
  warning: "bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-400 shadow-sm",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const sizes = {
    sm: "h-8 px-3 text-xs gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-11 px-5 text-sm gap-2",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60",
        sizes[size],
        BUTTON_VARIANT[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5 animate-spin text-current", className)} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/* ================================ Cards =============================== */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div className="flex items-start gap-3">
        {icon ? <span className="mt-0.5 text-navy-700">{icon}</span> : null}
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone = "navy",
  hint,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone?: "navy" | "green" | "amber" | "red" | "slate" | "blue";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    navy: "bg-navy-50 text-navy-800 ring-navy-200",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    blue: "bg-blue-50 text-blue-700 ring-blue-200",
  };
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
          {hint ? <p className="mt-1 truncate text-[11px] text-slate-500">{hint}</p> : null}
        </div>
        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1", tones[tone])}>{icon}</span>
      </div>
    </Card>
  );
}

/* ================================ Badges ============================== */

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        className ?? "bg-slate-100 text-slate-700 ring-slate-300",
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ label, className, dot }: { label: string; className?: string; dot?: string }) {
  return (
    <Badge className={className}>
      {dot ? <span className={cn("h-1.5 w-1.5 rounded-full", dot)} /> : null}
      {label}
    </Badge>
  );
}

/* ================================ Form ================================ */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label ? (
        <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-slate-700">
          {label}
          {required ? <span className="text-red-500">*</span> : null}
        </span>
      ) : null}
      {children}
      {hint && !error ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-[11px] font-medium text-red-600">{error}</span> : null}
    </label>
  );
}

const CONTROL =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-100 disabled:bg-slate-50 disabled:text-slate-500";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-[96px] leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, "appearance-none bg-[length:16px] pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === option.value ? "bg-white text-navy-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
          )}
        >
          {option.label}
          {option.count !== undefined ? (
            <span className="ml-1.5 tabular-nums text-slate-400">{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ================================ Modal =============================== */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:p-8">
      <div className={cn("animate-fade-up my-auto w-full rounded-xl bg-white shadow-2xl", widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

/* =============================== States =============================== */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <Info className="h-6 w-6" />}
      </span>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description ? <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-500">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-slate-800">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-10 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

/* ================================ Table =============================== */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function TR({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr className={cn("transition-colors hover:bg-slate-50/80", onClick && "cursor-pointer", className)} onClick={onClick}>
      {children}
    </tr>
  );
}

export function TH({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-4 py-2.5 font-semibold", className)}>{children}</th>;
}

export function TD({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle text-slate-700", className)}>{children}</td>;
}

/* ============================== Pagination ============================ */

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return <p className="px-4 py-3 text-xs text-slate-500">Menampilkan {total} data</p>;
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs text-slate-500">
      <span>
        Menampilkan {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} dari {total} data
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Sebelumnya
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Berikutnya
        </Button>
      </div>
    </div>
  );
}

/* ================================ Toast =============================== */

type Toast = { id: number; type: "success" | "error" | "info"; message: string };
type ToastContextValue = { push: (type: Toast["type"], message: string) => void };

const ToastContext = createContext<ToastContextValue>({ push: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((type: Toast["type"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, type, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
    error: <XCircle className="h-4 w-4 text-red-500" />,
    info: <Info className="h-4 w-4 text-navy-500" />,
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
          >
            <span className="mt-0.5">{icons[toast.type]}</span>
            <p className="flex-1 text-xs leading-relaxed text-slate-700">{toast.message}</p>
            <button
              type="button"
              className="text-slate-400 hover:text-slate-600"
              onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))}
              aria-label="Tutup notifikasi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
