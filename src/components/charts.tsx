"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const PALETTE = ["#0f2557", "#2550eb", "#6090fa", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#14b8a6"];

const TOOLTIP_STYLE = {
  borderRadius: 10,
  border: "1px solid #e2e8f0",
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
} as const;

export function MonthlyLetterChart({
  data,
}: {
  data: { label: string; total: number; masuk: number; keluar: number; disetujui: number }[];
}) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="gradKeluar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2550eb" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#2550eb" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="gradMasuk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
          <Area type="monotone" dataKey="keluar" name="Surat Keluar" stroke="#2550eb" strokeWidth={2} fill="url(#gradKeluar)" />
          <Area type="monotone" dataKey="masuk" name="Surat Masuk" stroke="#10b981" strokeWidth={2} fill="url(#gradMasuk)" />
          <Line type="monotone" dataKey="disetujui" name="Disetujui" stroke="#f59e0b" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CategoryPieChart({ data }: { data: { name: string; total: number }[] }) {
  const filtered = data.filter((d) => d.total > 0);
  if (!filtered.length) {
    return <p className="grid h-56 place-items-center text-xs text-slate-400">Belum ada data kategori.</p>;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={filtered} dataKey="total" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={2}>
            {filtered.map((entry, index) => (
              <Cell key={entry.name} fill={PALETTE[index % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function StatusBarChart({ data }: { data: { label: string; total: number; fill: string }[] }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} interval={0} angle={-18} height={52} textAnchor="end" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="total" name="Jumlah" radius={[6, 6, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ActivityLineChart({ data }: { data: { label: string; total: number }[] }) {
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={36} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="total" name="Aktivitas" stroke="#0f2557" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
