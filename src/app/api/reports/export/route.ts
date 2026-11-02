import PDFDocument from "pdfkit";
import { requireUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";
import {
  fetchApprovalTiming,
  fetchCategoryBreakdown,
  fetchMonthlySeries,
  fetchStatusCounts,
  fetchUserProductivity,
} from "@/lib/queries";
import { INDONESIAN_MONTHS, STATUS_META, type LetterStatus } from "@/lib/status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    if (!actor.permissions.includes("laporan.lihat") && !actor.permissions.includes("audit.lihat")) {
      return jsonOk({ error: "Anda tidak berhak mengekspor laporan." }, 403);
    }
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "excel" ? "excel" : "pdf";

    const [monthly, categories, productivity, timing, statusCounts] = await Promise.all([
      fetchMonthlySeries(12),
      fetchCategoryBreakdown(),
      fetchUserProductivity(),
      fetchApprovalTiming(),
      fetchStatusCounts(),
    ]);

    const generatedAt = new Date();
    const stamp = `${generatedAt.getDate()} ${INDONESIAN_MONTHS[generatedAt.getMonth()]} ${generatedAt.getFullYear()}`;
    const fileName = `laporan-persuratan-${generatedAt.toISOString().slice(0, 10)}`;

    await logAudit({
      actor,
      action: "ekspor_laporan",
      entity: "reports",
      description: `${actor.name} mengekspor laporan persuratan ke format ${format.toUpperCase()}`,
    });

    if (format === "excel") {
      const xml = buildExcel({ monthly, categories, productivity, timing, statusCounts, stamp });
      return new Response(xml, {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${fileName}.xls"`,
        },
      });
    }

    const pdf = await buildPdf({ monthly, categories, productivity, timing, statusCounts, stamp, actor: actor.name });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `attachment; filename="${fileName}.pdf"`,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

type ReportData = {
  monthly: { label: string; total: number; masuk: number; keluar: number; disetujui: number; ditolak: number }[];
  categories: { name: string; code: string; total: number }[];
  productivity: { name: string; department: string | null; dibuat: number; disetujui: number }[];
  timing: { avgHours: number; approved: number; rejected: number; revised: number; late: number; overduePending: number };
  statusCounts: { counts: Record<string, number>; total: number };
};

function escapeXml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sheet(name: string, rows: (string | number)[][]): string {
  const body = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) =>
            typeof cell === "number"
              ? `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`
              : `<Cell><Data ss:Type="String">${escapeXml(cell)}</Data></Cell>`,
          )
          .join("")}</Row>`,
    )
    .join("");
  return `<Worksheet ss:Name="${escapeXml(name)}"><Table>${body}</Table></Worksheet>`;
}

function buildExcel(data: ReportData & { stamp: string }): string {
  const summary: (string | number)[][] = [
    ["Laporan Persuratan E-SURAT"],
    ["Tanggal cetak", data.stamp],
    [],
    ["Ringkasan", "Jumlah"],
    ["Total surat", data.statusCounts.total],
    ["Disetujui", data.statusCounts.counts.disetujui ?? 0],
    ["Selesai", data.statusCounts.counts.selesai ?? 0],
    ["Diarsipkan", data.statusCounts.counts.diarsipkan ?? 0],
    ["Ditolak", data.statusCounts.counts.ditolak ?? 0],
    ["Revisi", data.statusCounts.counts.revisi ?? 0],
    ["Menunggu persetujuan", data.statusCounts.counts.menunggu_persetujuan ?? 0],
    ["Menunggu pemeriksaan", data.statusCounts.counts.menunggu_pemeriksaan ?? 0],
    ["Draft", data.statusCounts.counts.draft ?? 0],
    ["Rata-rata waktu persetujuan (jam)", Number(data.timing.avgHours.toFixed(1))],
    ["Tahapan melewati SLA", data.timing.overduePending],
  ];
  const monthly: (string | number)[][] = [
    ["Bulan", "Total", "Surat Masuk", "Surat Keluar", "Disetujui", "Ditolak"],
    ...data.monthly.map((m) => [m.label, m.total, m.masuk, m.keluar, m.disetujui, m.ditolak]),
  ];
  const category: (string | number)[][] = [
    ["Kode", "Kategori", "Jumlah Surat"],
    ...data.categories.map((c) => [c.code, c.name, c.total]),
  ];
  const productivity: (string | number)[][] = [
    ["Pengguna", "Departemen", "Surat Dibuat", "Surat Disetujui"],
    ...data.productivity.map((p) => [p.name, p.department ?? "-", p.dibuat, p.disetujui]),
  ];

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheet("Ringkasan", summary)}
${sheet("Per Bulan", monthly)}
${sheet("Per Kategori", category)}
${sheet("Produktivitas", productivity)}
</Workbook>`;
}

async function buildPdf(data: ReportData & { stamp: string; actor: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const table = (headers: string[], rows: (string | number)[][]) => {
    const widths = headers.map(() => (doc.page.width - 100) / headers.length);
    const drawRow = (cells: (string | number)[], bold: boolean) => {
      const y = doc.y;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      let x = 50;
      cells.forEach((cell, index) => {
        doc.text(String(cell ?? "-"), x + 4, y + 3, { width: widths[index] - 8, height: 16, ellipsis: true });
        x += widths[index];
      });
      doc.rect(50, y, widths.reduce((a, b) => a + b, 0), 18).stroke("#e2e8f0");
      doc.y = y + 18;
      doc.x = 50;
    };
    drawRow(headers, true);
    rows.forEach((row) => drawRow(row, false));
    doc.moveDown(1);
  };

  doc.font("Helvetica-Bold").fontSize(16).text("LAPORAN PERSURATAN", { align: "center" });
  doc.font("Helvetica").fontSize(10).text("Sistem Informasi Manajemen Persuratan Digital (E-SURAT)", { align: "center" });
  doc.moveDown(0.4);
  doc.fontSize(9).fillColor("#475569").text(`Dicetak pada ${data.stamp} oleh ${data.actor}`, { align: "center" });
  doc.fillColor("#000").moveDown(1);

  doc.font("Helvetica-Bold").fontSize(12).text("1. Ringkasan Umum");
  doc.moveDown(0.4);
  table(["Indikator", "Nilai"], [
    ["Total surat", data.statusCounts.total],
    ["Disetujui / Selesai / Diarsipkan", `${data.statusCounts.counts.disetujui ?? 0} / ${data.statusCounts.counts.selesai ?? 0} / ${data.statusCounts.counts.diarsipkan ?? 0}`],
    ["Ditolak", data.statusCounts.counts.ditolak ?? 0],
    ["Dalam revisi", data.statusCounts.counts.revisi ?? 0],
    ["Menunggu persetujuan", data.statusCounts.counts.menunggu_persetujuan ?? 0],
    ["Rata-rata waktu persetujuan", `${data.timing.avgHours.toFixed(1)} jam`],
    ["Tahapan melewati SLA", data.timing.overduePending],
  ]);

  doc.font("Helvetica-Bold").fontSize(12).text("2. Volume Surat per Bulan");
  doc.moveDown(0.4);
  table(["Bulan", "Total", "Masuk", "Keluar", "Disetujui", "Ditolak"], data.monthly.map((m) => [m.label, m.total, m.masuk, m.keluar, m.disetujui, m.ditolak]));

  doc.font("Helvetica-Bold").fontSize(12).text("3. Surat per Kategori");
  doc.moveDown(0.4);
  table(["Kode", "Kategori", "Jumlah"], data.categories.map((c) => [c.code, c.name, c.total]));

  doc.font("Helvetica-Bold").fontSize(12).text("4. Produktivitas Pengguna");
  doc.moveDown(0.4);
  table(["Pengguna", "Departemen", "Dibuat", "Disetujui"], data.productivity.map((p) => [p.name, p.department ?? "-", p.dibuat, p.disetujui]));

  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(8).fillColor("#64748b").text(
    `Status yang dilaporkan: ${Object.entries(STATUS_META)
      .map(([key, meta]) => `${(meta as { label: string }).label} (${key})`)
      .join(", ")}. Laporan dihasilkan otomatis dari basis data E-SURAT.`,
    { align: "center" },
  );
  void (STATUS_META as Record<LetterStatus, unknown>);

  doc.end();
  return done;
}
