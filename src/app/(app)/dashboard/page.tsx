import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  Archive,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FilePlus2,
  FileText,
  Inbox,
  PenLine,
  Send,
  XCircle,
} from "lucide-react";
import { db } from "@/db";
import { auditLogs, letterApprovals, letterCategories, letters, users } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import {
  fetchCategoryBreakdown,
  fetchMonthlySeries,
  fetchRecentActivities,
  fetchStatusCounts,
} from "@/lib/queries";
import { ActivityLineChart, CategoryPieChart, MonthlyLetterChart, StatusBarChart } from "@/components/charts";
import { Badge, Button, Card, CardHeader, EmptyState, StatCard, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatusPill } from "@/components/letter-table";
import { INDONESIAN_MONTHS, ROLE, STATUS_META, formatDateTimeID, type LetterStatus } from "@/lib/status";

export const dynamic = "force-dynamic";

const STATUS_CHART_FILL: Record<string, string> = {
  draft: "#94a3b8",
  diajukan: "#6090fa",
  menunggu_pemeriksaan: "#f59e0b",
  dalam_pemeriksaan: "#2550eb",
  revisi: "#ef4444",
  menunggu_persetujuan: "#fbbf24",
  disetujui: "#10b981",
  ditolak: "#dc2626",
  selesai: "#059669",
  diarsipkan: "#047857",
};

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const now = new Date();
  const [statusData, monthly, categories, activities, directionRows, activityRows] = await Promise.all([
    fetchStatusCounts(user.id),
    fetchMonthlySeries(12),
    fetchCategoryBreakdown(),
    fetchRecentActivities(10),
    db
      .select({
        direction: letterCategories.direction,
        total: sql<number>`count(${letters.id})::int`,
      })
      .from(letters)
      .leftJoin(letterCategories, eq(letterCategories.id, letters.categoryId))
      .groupBy(letterCategories.direction),
    db
      .select({
        month: sql<string>`to_char(${auditLogs.createdAt}, 'YYYY-MM')`,
        total: sql<number>`count(*)::int`,
      })
      .from(auditLogs)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const counts = statusData.counts;
  const masuk = directionRows.find((d) => d.direction === "masuk")?.total ?? 0;
  const keluar = directionRows.filter((d) => d.direction !== "masuk").reduce((sum, d) => sum + d.total, 0);
  const perluTindakan =
    (counts.menunggu_pemeriksaan ?? 0) + (counts.dalam_pemeriksaan ?? 0) + (counts.menunggu_persetujuan ?? 0);

  const activitySeries: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    activitySeries.push({
      label: `${INDONESIAN_MONTHS[date.getMonth()].slice(0, 3)} ${String(date.getFullYear()).slice(2)}`,
      total: activityRows.find((r) => r.month === key)?.total ?? 0,
    });
  }

  const statusChart = (Object.keys(STATUS_META) as LetterStatus[]).map((key) => ({
    label: STATUS_META[key].label,
    total: counts[key] ?? 0,
    fill: STATUS_CHART_FILL[key] ?? "#94a3b8",
  }));

  const isCreator = user.roleCode === ROLE.USER;
  const actionQueue = isCreator
    ? await db
        .select({ letter: letters })
        .from(letters)
        .where(and(eq(letters.senderId, user.id), inArray(letters.status, ["draft", "revisi", "ditolak"])))
        .orderBy(desc(letters.updatedAt))
        .limit(6)
    : await db
        .select({ letter: letters, approval: letterApprovals, sender: users })
        .from(letterApprovals)
        .innerJoin(letters, eq(letters.id, letterApprovals.letterId))
        .leftJoin(users, eq(users.id, letters.senderId))
        .where(
          and(
            eq(letterApprovals.status, "pending"),
            user.roleCode === ROLE.SUPER_ADMIN
              ? sql`true`
              : eq(letterApprovals.roleCode, user.roleCode),
          ),
        )
        .orderBy(desc(letterApprovals.createdAt))
        .limit(6);

  const recentMine = await db
    .select({ letter: letters })
    .from(letters)
    .where(isCreator ? eq(letters.senderId, user.id) : sql`true`)
    .orderBy(desc(letters.updatedAt))
    .limit(5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-navy-600">
            {now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            Selamat datang, {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {user.roleName}
            {user.departmentName ? ` · ${user.departmentName}` : ""} — ringkasan aktivitas persuratan hari ini.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/monitoring">
            <Button variant="outline" icon={<Clock className="h-4 w-4" />}>
              Monitoring
            </Button>
          </Link>
          <Link href="/surat/baru">
            <Button icon={<FilePlus2 className="h-4 w-4" />}>Buat Surat Baru</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Surat Dibuat" value={statusData.total} icon={<FileText className="h-5 w-5" />} tone="navy" hint={`${statusData.mine} dibuat oleh Anda`} />
        <StatCard label="Surat Masuk" value={masuk} icon={<Inbox className="h-5 w-5" />} tone="blue" hint="Kategori surat masuk" />
        <StatCard label="Surat Keluar" value={keluar} icon={<Send className="h-5 w-5" />} tone="blue" hint="Kategori surat keluar/internal" />
        <StatCard label="Menunggu Persetujuan" value={counts.menunggu_persetujuan ?? 0} icon={<ClipboardCheck className="h-5 w-5" />} tone="amber" hint={`${counts.menunggu_pemeriksaan ?? 0} menunggu pemeriksaan`} />
        <StatCard label="Dalam Proses Revisi" value={counts.revisi ?? 0} icon={<PenLine className="h-5 w-5" />} tone="red" hint={`${counts.dalam_pemeriksaan ?? 0} sedang diperiksa`} />
        <StatCard label="Disetujui" value={counts.disetujui ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" hint={`${counts.ditolak ?? 0} ditolak`} />
        <StatCard label="Selesai" value={counts.selesai ?? 0} icon={<CheckCircle2 className="h-5 w-5" />} tone="green" hint={`${perluTindakan} surat butuh tindakan`} />
        <StatCard label="Diarsipkan" value={counts.diarsipkan ?? 0} icon={<Archive className="h-5 w-5" />} tone="slate" hint="Arsip digital" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Statistik Persuratan per Bulan"
            subtitle="Volume surat masuk, keluar, dan yang disetujui selama 12 bulan terakhir"
            icon={<FileText className="h-4 w-4" />}
            action={
              <Link href="/laporan" className="text-xs font-medium text-navy-700 hover:underline">
                Laporan lengkap →
              </Link>
            }
          />
          <div className="p-4">
            <MonthlyLetterChart data={monthly} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Komposisi Jenis Surat" subtitle="Distribusi surat berdasarkan kategori" />
          <div className="p-4">
            <CategoryPieChart data={categories.map((c) => ({ name: c.name, total: c.total }))} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title={isCreator ? "Surat yang Perlu Anda Tindak" : "Antrean Tindakan Anda"}
            subtitle={
              isCreator
                ? "Draft, revisi, dan surat ditolak yang menunggu perbaikan"
                : "Tahapan persetujuan yang menunggu keputusan sesuai kewenangan Anda"
            }
            icon={<ClipboardCheck className="h-4 w-4" />}
            action={
              <Link href={isCreator ? "/surat?scope=mine" : "/persetujuan"} className="text-xs font-medium text-navy-700 hover:underline">
                Lihat semua →
              </Link>
            }
          />
          {actionQueue.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-6 w-6 text-emerald-500" />}
              title="Tidak ada antrean"
              description={isCreator ? "Semua surat Anda sudah diproses." : "Tidak ada surat yang menunggu keputusan Anda saat ini."}
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Perihal</TH>
                  <TH>{isCreator ? "Status" : "Tahap"}</TH>
                  {!isCreator ? <TH>Pembuat</TH> : null}
                  <TH className="w-10" />
                </tr>
              </THead>
              <TBody>
                {actionQueue.map((row) => {
                  const approval = "approval" in row ? (row.approval as typeof letterApprovals.$inferSelect) : null;
                  const sender = "sender" in row ? (row.sender as typeof users.$inferSelect | null) : null;
                  return (
                    <TR key={`${row.letter.id}-${approval?.id ?? "own"}`}>
                      <TD className="max-w-[320px]">
                        <Link href={`/surat/${row.letter.id}`} className="line-clamp-1 text-sm font-medium text-slate-900 hover:text-navy-700">
                          {row.letter.title}
                        </Link>
                        <span className="mt-0.5 block text-[11px] text-slate-400">
                          {row.letter.letterNumber ?? `#${row.letter.id}`} · {formatDateTimeID(row.letter.updatedAt)}
                        </span>
                      </TD>
                      <TD>{approval ? <Badge className="bg-amber-50 text-amber-700 ring-amber-300">{approval.label}</Badge> : <StatusPill status={row.letter.status} />}</TD>
                      {!isCreator ? <TD className="text-xs text-slate-600">{sender?.name ?? "—"}</TD> : null}
                      <TD>
                        <Link href={`/surat/${row.letter.id}`} className="text-slate-400 hover:text-navy-700">
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>

        <Card>
          <CardHeader title="Aktivitas Pengguna" subtitle="Jumlah aktivitas tercatat per bulan" icon={<Clock className="h-4 w-4" />} />
          <div className="p-4">
            <ActivityLineChart data={activitySeries} />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Aktivitas Terbaru" subtitle="Jejak audit seluruh pengguna (tidak dapat diubah)" icon={<ClipboardCheck className="h-4 w-4" />} action={<Link href="/audit" className="text-xs font-medium text-navy-700 hover:underline">Audit log →</Link>} />
          {activities.length === 0 ? (
            <EmptyState title="Belum ada aktivitas" description="Aktivitas sistem akan tercatat otomatis di sini." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activities.map((activity) => (
                <li key={activity.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-50 text-[10px] font-semibold text-navy-800">
                    {activity.userName?.split(" ").slice(0, 2).map((n) => n[0]).join("") ?? "S"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700">
                      <span className="font-semibold text-slate-900">{activity.userName}</span>{" "}
                      <Badge className="ml-1 bg-slate-100 text-slate-600 ring-slate-200">{activity.action}</Badge>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{activity.description}</p>
                  </div>
                  <span className="shrink-0 text-[10px] text-slate-400">{formatDateTimeID(activity.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Sebaran Status Surat" subtitle="Jumlah surat pada setiap status" />
            <div className="p-4">
              <StatusBarChart data={statusChart} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Surat Terbaru" subtitle="5 surat terakhir diperbarui" />
            {recentMine.length === 0 ? (
              <EmptyState title="Belum ada surat" description="Mulai dengan membuat surat dari template." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentMine.map(({ letter }) => (
                  <li key={letter.id} className="px-5 py-3">
                    <Link href={`/surat/${letter.id}`} className="line-clamp-1 text-xs font-medium text-slate-800 hover:text-navy-700">
                      {letter.title}
                    </Link>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusPill status={letter.status} />
                      <span className="text-[10px] text-slate-400">{letter.letterNumber ?? `#${letter.id}`}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {counts.ditolak > 0 || counts.revisi > 0 ? (
            <Card className="border-red-200 bg-red-50/40">
              <div className="flex items-start gap-3 p-4">
                <XCircle className="mt-0.5 h-5 w-5 text-red-500" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Perlu perhatian</p>
                  <p className="mt-1 text-xs text-red-700">
                    {counts.revisi} surat menunggu revisi dan {counts.ditolak} surat ditolak. Tinjau catatan pemeriksa
                    lalu ajukan kembali.
                  </p>
                </div>
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
