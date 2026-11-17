import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  BorderStyle,
  Footer,
  WidthType,
} from "docx";
import PDFDocument from "pdfkit";
import { readStoredFile } from "@/lib/storage";
import { formatDateID } from "@/lib/status";
import { classifyLetterLine } from "@/lib/letter-format";
import { isWatermarkCandidatePart, stripDocxWatermarks } from "@/lib/docx-watermark";
import { appendAttachmentsSection, type DocxAttachmentItem } from "@/lib/docx-attachments";
import { normalizeSigners, signerColumns, type LetterSigner } from "@/lib/signers";

// Logika placeholder dipisah ke modul netral agar bisa dipakai client & server.
import {
  PLACEHOLDER_REGEX,
  PLACEHOLDER_SYNTAXES,
  SYSTEM_KEYS,
  extractPlaceholders,
  decodeXmlEntities,
  isStrictPlaceholderCandidate,
  normalizeDocxPlaceholders,
  normalizePlaceholders,
  renderPlaceholders,
  type PlaceholderOptions,
} from "@/lib/placeholders";

export {
  PLACEHOLDER_REGEX,
  PLACEHOLDER_SYNTAXES,
  SYSTEM_KEYS,
  extractPlaceholders,
  normalizePlaceholders,
};
export type { PlaceholderOptions, PlaceholderSyntax } from "@/lib/placeholders";

export type LetterDocumentInput = {
  number: string;
  date: string;
  title: string;
  recipientName: string;
  recipientPosition: string;
  recipientAddress: string;
  bodyText: string;
  kopText: string;
  /** Footer halaman (alamat/telepon/email) yang diambil dari template. */
  footerText?: string | null;
  /** Penanda tangan per surat (maks. 4); kosong → pakai signerName/signerPosition. */
  signers?: LetterSigner[];
  signerName: string;
  signerPosition: string;
  signerNip?: string | null;
  senderName: string;
  senderPosition: string;
  classification?: string | null;
  attachments: string[];
  data: Record<string, unknown>;
};

/**
 * Daftar penanda tangan yang dipakai saat mencetak.
 * Surat dengan `signers` (maks. 4) memakai daftar itu; surat lama yang belum
 * punya daftar tetap memakai satu penanda tangan dari template.
 */
/** Sel tabel tanda tangan tanpa garis (hanya untuk tata letak). */
function TableCellBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  return { top: none, bottom: none, left: none, right: none };
}

export function resolveSigners(input: LetterDocumentInput): LetterSigner[] {
  const explicit = normalizeSigners(input.signers ?? []);
  if (explicit.length) return explicit;
  if (!input.signerName && !input.signerPosition) return [];
  return normalizeSigners([
    {
      label: "Hormat kami",
      name: input.signerName || "-",
      position: input.signerPosition || "",
      nip: input.signerNip ?? "",
    },
  ]);
}

export async function extractPlaceholdersFromDocx(
  buffer: Buffer,
  options: PlaceholderOptions = {},
): Promise<string[]> {
  const zip = new PizZip(buffer);
  const parts = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml"];
  const found: string[] = [];
  for (const part of parts) {
    const file = zip.file(part);
    if (!file) continue;
    const xml = file.asText();
    // Word kerap memecah tag {{ }} menjadi beberapa run — gabungkan dulu.
    const flat = decodeXmlEntities(xml.replace(/<[^>]+>/g, ""));
    for (const key of extractPlaceholders(flat, options)) {
      if (!found.includes(key)) found.push(key);
    }
  }
  return found;
}

/** Isi semua placeholder (format apa pun) dengan data surat. */
export function renderTemplateText(
  template: string,
  data: Record<string, unknown>,
  options: PlaceholderOptions = {},
): string {
  return renderPlaceholders(template, data, options);
}

/**
 * Menyusun naskah surat dari template + data formulir.
 *
 * Perbaikan bug "isi surat tidak muncul": bila template tidak memiliki placeholder
 * `{{isi_surat}}` namun pengguna mengisi kolom Isi Surat, teks tersebut ditambahkan
 * sebagai paragraf setelah naskah template — jadi isian pengguna tidak pernah hilang.
 */
export function composeLetterBody(
  template: string | null | undefined,
  data: Record<string, unknown>,
): string {
  const source = template ?? "";
  const rendered = renderPlaceholders(source, data).trim();
  const isiSurat = typeof data.isi_surat === "string" ? data.isi_surat.trim() : "";
  if (!isiSurat) return rendered;
  if (extractPlaceholders(source).includes("isi_surat")) return rendered;
  if (rendered.includes(isiSurat)) return rendered;
  return rendered ? `${rendered}\n\n${isiSurat}` : isiSurat;
}

export function buildDocumentData(input: LetterDocumentInput): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of SYSTEM_KEYS) data[key] = "";
  for (const [key, value] of Object.entries(input.data ?? {})) {
    data[key] = value === null || value === undefined ? "" : String(value);
  }
  Object.assign(data, {
    nomor_surat: input.number || "(menunggu nomor)",
    tanggal_surat: input.date || "",
    tanggal_lengkap: formatDateID(input.date),
    nama_penerima: input.recipientName || "",
    jabatan_penerima: input.recipientPosition || "",
    alamat_penerima: input.recipientAddress || "",
    perihal: input.title || "",
    isi_surat: input.bodyText || "",
    nama_pembuat: input.senderName || "",
    jabatan_pembuat: input.senderPosition || "",
    nama_penandatangan: input.signerName || "",
    jabatan_penandatangan: input.signerPosition || "",
    nip_penandatangan: input.signerNip || "",
    lampiran: input.attachments.length ? String(input.attachments.length) : "-",
    kop_surat: input.kopText || "",
  });
  return data;
}

/** Bagian DOCX yang mungkin memuat placeholder. */
const DOCX_PLACEHOLDER_PARTS = [
  "word/document.xml",
  "word/header1.xml",
  "word/header2.xml",
  "word/header3.xml",
  "word/footer1.xml",
  "word/footer2.xml",
  "word/footer3.xml",
];

/**
 * Word sering memecah satu placeholder menjadi beberapa run (`<w:t>`), misalnya
 * `<<` + `nama` + `>>`. Bila itu terjadi, pola alternatif tidak akan terbaca.
 * Untuk paragraf yang mengandung penanda format alternatif, seluruh teks run
 * digabung ke run pertama — cukup aman karena hanya menyentuh paragraf tersebut.
 */
function mergeRunsInPlaceholderParagraphs(xml: string): string {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph: string) => {
    const plain = decodeXmlEntities(paragraph.replace(/<[^>]+>/g, ""));
    const hasAlternativeSyntax = /<<|\$\{|\[/.test(plain);
    if (!hasAlternativeSyntax) return paragraph;

    const textPieces: string[] = [];
    const collect = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
    let collected: RegExpExecArray | null;
    while ((collected = collect.exec(paragraph)) !== null) textPieces.push(collected[1]);
    if (textPieces.length < 2) return paragraph;

    const merged = textPieces.join("");
    let first = true;
    return paragraph.replace(/<w:t(\s[^>]*)?>[\s\S]*?<\/w:t>/g, (_match, attrs: string | undefined) => {
      if (first) {
        first = false;
        return `<w:t${attrs ?? ""}>${merged}</w:t>`;
      }
      return `<w:t${attrs ?? ""}></w:t>`;
    });
  });
}

/**
 * Membuang watermark (umumnya nama instansi) dari berkas DOCX unggahan.
 * Dipakai saat template disimpan agar dokumen hasil cetak selalu bersih.
 */
export function cleanDocxWatermarks(buffer: Buffer): Buffer {
  try {
    const zip = new PizZip(buffer);
    let changed = false;
    for (const name of Object.keys(zip.files)) {
      if (!isWatermarkCandidatePart(name)) continue;
      const file = zip.file(name);
      if (!file) continue;
      const original = file.asText();
      const cleaned = stripDocxWatermarks(original);
      if (cleaned !== original) {
        zip.file(name, cleaned);
        changed = true;
      }
    }
    if (!changed) return buffer;
    return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  } catch {
    return buffer;
  }
}

/** Render DOCX dari template unggahan; jika gagal/tidak ada, bangun dokumen standar. */
export async function generateDocx(
  input: LetterDocumentInput,
  templateDocxPath?: string | null,
  attachmentItems: DocxAttachmentItem[] = [],
): Promise<Buffer> {
  const data = buildDocumentData(input);

  if (templateDocxPath) {
    try {
      const source = await readStoredFile(templateDocxPath);
      const zip = new PizZip(source);
      // docxtemplater hanya mengenal satu gaya placeholder, jadi semua format
      // alternatif (<<f>>, ${f}, [f]) dinormalkan ke {{f}} lebih dulu.
      let usesDoubleBraces = false;
      for (const part of DOCX_PLACEHOLDER_PARTS) {
        const file = zip.file(part);
        if (!file) continue;
        const normalized = normalizeDocxPlaceholders(
          mergeRunsInPlaceholderParagraphs(file.asText()),
          { knownKeys: Object.keys(data) },
        );
        if (normalized.includes("{{")) usesDoubleBraces = true;
        zip.file(part, normalized);
      }

      // Buang watermark (biasanya nama instansi) dari header/footer dokumen
      // agar hasil cetak dan unduhan bersih.
      for (const name of Object.keys(zip.files)) {
        if (!isWatermarkCandidatePart(name)) continue;
        const file = zip.file(name);
        if (!file) continue;
        const cleaned = stripDocxWatermarks(file.asText());
        if (cleaned !== file.asText()) zip.file(name, cleaned);
      }

      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "",
        // Template lama yang memakai {field} tunggal tetap didukung.
        ...(usesDoubleBraces ? { delimiters: { start: "{{", end: "}}" } } : {}),
      });
      doc.render(data);
      const rendered = doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
      return appendAttachmentsSection(rendered, attachmentItems, {
        letterNumber: input.number,
        title: input.title,
      });
    } catch {
      // fallback ke dokumen standar
    }
  }

  const paragraphs: (Paragraph | Table)[] = [];
  const kopLines = (input.kopText || "PEMERINTAH REPUBLIK INDONESIA\nUNIT KERJA / ORGANISASI\nAlamat: Jl. Contoh No. 1, Indonesia")
    .split("\n")
    .filter(Boolean);
  kopLines.forEach((line, index) => {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [
          new TextRun({
            text: line.toUpperCase(),
            bold: index < 2,
            size: index === 0 ? 28 : 22,
            font: "Times New Roman",
          }),
        ],
      }),
    );
  });
  paragraphs.push(
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 12 } },
      children: [new TextRun({ text: "" })],
    }),
  );

  paragraphs.push(
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `Nomor\t: ${data.nomor_surat}`, size: 24, font: "Times New Roman" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `Lampiran\t: ${data.lampiran}`, size: 24, font: "Times New Roman" }),
      ],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [
        new TextRun({ text: `Perihal\t: ${data.perihal}`, size: 24, font: "Times New Roman", bold: true }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 240 },
      children: [
        new TextRun({ text: `${data.tanggal_lengkap}`, size: 24, font: "Times New Roman" }),
      ],
    }),
  );

  if (input.recipientName) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: "Kepada Yth.", size: 24, font: "Times New Roman" })],
      }),
      new Paragraph({
        children: [new TextRun({ text: input.recipientName, size: 24, font: "Times New Roman", bold: true })],
      }),
    );
    if (input.recipientPosition) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: input.recipientPosition, size: 24, font: "Times New Roman" })],
        }),
      );
    }
    if (input.recipientAddress) {
      paragraphs.push(
        new Paragraph({
          spacing: { after: 240 },
          children: [new TextRun({ text: input.recipientAddress, size: 24, font: "Times New Roman" })],
        }),
      );
    } else {
      paragraphs.push(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: "" })] }));
    }
  }

  paragraphs.push(
    new Paragraph({
      spacing: { after: 160 },
      children: [new TextRun({ text: "Dengan hormat,", size: 24, font: "Times New Roman" })],
    }),
  );

  for (const paragraph of (input.bodyText || "").split("\n")) {
    const kind = classifyLetterLine(paragraph);
    if (kind === "blank") continue;
    paragraphs.push(
      new Paragraph({
        alignment: kind === "paragraph" ? AlignmentType.JUSTIFIED : AlignmentType.LEFT,
        spacing: { after: 120 },
        indent:
          kind === "paragraph"
            ? { firstLine: 400 }
            : kind === "list"
              ? { left: 400, hanging: 200 }
              : { left: 400 },
        children: [new TextRun({ text: paragraph.trim(), size: 24, font: "Times New Roman" })],
      }),
    );
  }

  if (input.attachments.length) {
    paragraphs.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [new TextRun({ text: "Dokumen pendukung:", size: 24, font: "Times New Roman", bold: true })],
      }),
    );
    input.attachments.forEach((name, index) => {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: `${index + 1}. ${name}`, size: 22, font: "Times New Roman" })],
        }),
      );
    });
  }

  const signers = resolveSigners(input);
  if (signers.length) {
    const columns = signerColumns(signers.length);
    const rows: TableRow[] = [];
    // Baris pertama: label ("Hormat kami", "Mengetahui", …).
    rows.push(
      new TableRow({
        children: signers.map(
          (signer) =>
            new TableCell({
              width: { size: Math.floor(100 / columns), type: WidthType.PERCENTAGE },
              borders: TableCellBorders(),
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: signer.label, size: 24, font: "Times New Roman" })],
                }),
              ],
            }),
        ),
      }),
    );
    // Baris kedua: jabatan.
    rows.push(
      new TableRow({
        children: signers.map(
          (signer) =>
            new TableCell({
              borders: TableCellBorders(),
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: signer.position, size: 24, font: "Times New Roman" })],
                }),
              ],
            }),
        ),
      }),
    );
    // Baris ketiga: ruang tanda tangan + nama bergaris bawah.
    rows.push(
      new TableRow({
        children: signers.map(
          (signer) =>
            new TableCell({
              borders: TableCellBorders(),
              children: [
                new Paragraph({ spacing: { before: 700 }, children: [new TextRun({ text: "" })] }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: signer.name, size: 24, font: "Times New Roman", bold: true, underline: {} }),
                  ],
                }),
                ...(signer.nip
                  ? [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: `NIP. ${signer.nip}`, size: 22, font: "Times New Roman" })],
                      }),
                    ]
                  : []),
              ],
            }),
        ),
      }),
    );

    paragraphs.push(
      new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: "" })] }),
      new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
    );
  }
  paragraphs.push(
    new Paragraph({
      spacing: { before: 480 },
      children: [
        new TextRun({
          text: `Dokumen ini disetujui secara elektronik melalui sistem E-SURAT oleh ${input.senderName || "-"} tanpa tanda tangan basah.`,
          italics: true,
          size: 18,
          font: "Times New Roman",
        }),
      ],
    }),
  );

  const footerText = (input.footerText ?? "").trim();
  const doc = new Document({
    creator: "E-SURAT",
    title: input.title,
    sections: [
      {
        properties: {},
        children: paragraphs,
        ...(footerText
          ? {
              footers: {
                default: new Footer({
                  children: footerText.split("\n").map(
                    (line) =>
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        border: { top: { color: "94A3B8", space: 4, style: BorderStyle.SINGLE, size: 4 } },
                        children: [
                          new TextRun({ text: line, size: 16, italics: true, color: "475569", font: "Times New Roman" }),
                        ],
                      }),
                  ),
                }),
              },
            }
          : {}),
      },
    ],
  });

  const built = Buffer.from(await Packer.toBuffer(doc));
  return appendAttachmentsSection(built, attachmentItems, {
    letterNumber: input.number,
    title: input.title,
  });
}

export async function generatePdf(input: LetterDocumentInput): Promise<Buffer> {
  const data = buildDocumentData(input);
  const doc = new PDFDocument({
    size: "A4",
    margin: 70,
    // bufferPages agar footer dapat dicap pada SEMUA halaman setelah isi selesai.
    bufferPages: true,
    info: { Title: input.title, Author: "E-SURAT" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const kopLines = (input.kopText || "PEMERINTAH REPUBLIK INDONESIA\nUNIT KERJA / ORGANISASI\nAlamat: Jl. Contoh No. 1, Indonesia")
    .split("\n")
    .filter(Boolean);
  kopLines.forEach((line, index) => {
    doc
      .font("Helvetica-Bold")
      .fontSize(index === 0 ? 14 : index === 1 ? 12 : 9)
      .text(line.toUpperCase(), { align: "center" });
  });
  doc.moveDown(0.4);
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + pageWidth, doc.y).lineWidth(1.4).stroke();
  doc.moveDown(1);

  doc.font("Helvetica").fontSize(11);
  const leftX = doc.page.margins.left;
  const rowY = doc.y;
  doc.text(`Nomor`, leftX, rowY, { width: 70, continued: false });
  doc.text(`: ${data.nomor_surat}`, leftX + 72, rowY, { width: 220 });
  doc.text(`Lampiran`, leftX, rowY + 16, { width: 70 });
  doc.text(`: ${data.lampiran}`, leftX + 72, rowY + 16, { width: 220 });
  doc.text(`Perihal`, leftX, rowY + 32, { width: 70 });
  doc.font("Helvetica-Bold").text(`: ${data.perihal}`, leftX + 72, rowY + 32, { width: 220 });
  doc.font("Helvetica").text(data.tanggal_lengkap, leftX + pageWidth - 170, rowY, { width: 170, align: "right" });
  doc.y = rowY + 52;
  doc.x = leftX;

  if (input.recipientName) {
    doc.moveDown(0.6);
    doc.text("Kepada Yth.", leftX);
    doc.font("Helvetica-Bold").text(input.recipientName, leftX);
    doc.font("Helvetica");
    if (input.recipientPosition) doc.text(input.recipientPosition, leftX);
    if (input.recipientAddress) doc.text(input.recipientAddress, leftX, doc.y, { width: 320 });
    doc.moveDown(0.8);
  }

  doc.text("Dengan hormat,", leftX);
  doc.moveDown(0.4);
  for (const paragraph of (input.bodyText || "").split("\n")) {
    const kind = classifyLetterLine(paragraph);
    if (kind === "blank") {
      doc.moveDown(0.25);
      continue;
    }
    const flush = kind !== "paragraph";
    doc.text(paragraph.trim(), leftX + (flush ? 20 : 0), doc.y, {
      width: pageWidth - (flush ? 20 : 0),
      align: flush ? "left" : "justify",
      paragraphGap: 6,
      indent: flush ? 0 : 20,
    });
    doc.moveDown(0.35);
  }

  if (input.attachments.length) {
    doc.moveDown(0.4);
    doc.font("Helvetica-Bold").text("Dokumen pendukung:", leftX);
    doc.font("Helvetica").fontSize(10);
    input.attachments.forEach((name, index) => doc.text(`${index + 1}. ${name}`, leftX + 8));
    doc.fontSize(11);
  }

  drawSignatures(doc, {
    signers: resolveSigners(input),
    leftX,
    pageWidth,
    font: "Helvetica",
    boldFont: "Helvetica-Bold",
  });

  stampFooter(doc, {
    footerText: input.footerText ?? "",
    statement:
      "Disetujui secara elektronik melalui sistem E-SURAT. Dokumen sah tanpa tanda tangan basah dan stempel.",
    leftX,
    pageWidth,
  });

  doc.end();
  return done;
}

type PdfDoc = InstanceType<typeof PDFDocument>;

/**
 * Menggambar blok tanda tangan 1–4 penanda tangan.
 * 1 → rata kanan; 2 → dua kolom; 3 → tiga kolom; 4 → 2×2.
 * Setiap blok: label, jabatan, ruang tanda tangan, nama bergaris bawah, NIP.
 */
function drawSignatures(
  doc: PdfDoc,
  options: { signers: LetterSigner[]; leftX: number; pageWidth: number; font: string; boldFont: string },
) {
  const { signers, leftX, pageWidth, font, boldFont } = options;
  if (!signers.length) return;

  const columns = signerColumns(signers.length);
  const rows = Math.ceil(signers.length / columns);
  const gap = columns === 1 ? 0 : 14;
  // Satu penanda tangan memakai separuh kanan halaman (kebiasaan surat resmi).
  const singleWidth = pageWidth / 2;
  const blockWidth = columns === 1 ? singleWidth : (pageWidth - gap * (columns - 1)) / columns;
  const baseX = columns === 1 ? leftX + pageWidth - singleWidth : leftX;
  const blockHeight = 132;
  const needed = rows * blockHeight + 24;

  doc.moveDown(1.4);
  let startY = doc.y;
  if (startY + needed > doc.page.height - 120) {
    doc.addPage();
    startY = doc.page.margins.top;
  }

  signers.forEach((signer, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const usedInRow = Math.min(columns, signers.length - row * columns);
    // Blok terakhir pada baris yang belum penuh diratakan ke kanan.
    const offset = usedInRow < columns ? (columns - usedInRow) * (blockWidth + gap) : 0;
    const x = baseX + offset + col * (blockWidth + gap);
    let y = startY + row * blockHeight;

    doc.font(font).fontSize(11).fillColor("#0f172a");
    if (signer.label) {
      doc.text(signer.label, x, y, { width: blockWidth, align: "center" });
      y = doc.y + 2;
    }
    if (signer.position) {
      doc.text(signer.position, x, y, { width: blockWidth, align: "center" });
      y = doc.y;
    }

    // Ruang untuk tanda tangan basah.
    y += 52;
    doc.font(boldFont).fontSize(11).text(signer.name, x, y, { width: blockWidth, align: "center" });
    const nameWidth = Math.min(blockWidth, doc.widthOfString(signer.name) + 6);
    doc
      .moveTo(x + (blockWidth - nameWidth) / 2, y + 14)
      .lineTo(x + (blockWidth + nameWidth) / 2, y + 14)
      .lineWidth(0.7)
      .strokeColor("#0f172a")
      .stroke();
    y += 18;
    doc.font(font).fontSize(9.5);
    if (signer.nip) doc.text(`NIP. ${signer.nip}`, x, y, { width: blockWidth, align: "center" });
  });

  doc.fillColor("#0f172a");
  doc.y = startY + needed;
}

/** Footer instansi + keterangan pengesahan elektronik pada setiap halaman. */
function stampFooter(
  doc: PdfDoc,
  options: { footerText: string; statement: string; leftX: number; pageWidth: number },
) {
  const { footerText, statement, leftX, pageWidth } = options;
  const footerLines = footerText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    // Cegah pdfkit menambah halaman baru saat menulis di area bawah.
    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const bottom = doc.page.height;
    doc.font("Helvetica").fontSize(7.5).fillColor("#64748b");
    const statementY = bottom - (footerLines.length ? 46 + footerLines.length * 10 : 42);
    doc.text(statement, leftX, statementY, { width: pageWidth, align: "center" });

    if (footerLines.length) {
      const lineY = bottom - 40 - footerLines.length * 10;
      doc
        .moveTo(leftX, lineY)
        .lineTo(leftX + pageWidth, lineY)
        .lineWidth(0.6)
        .strokeColor("#cbd5e1")
        .stroke();
      footerLines.forEach((line, lineIndex) => {
        doc.fontSize(8).fillColor("#475569").text(line, leftX, lineY + 6 + lineIndex * 10, {
          width: pageWidth,
          align: "center",
        });
      });
    }

    doc.fillColor("#0f172a");
    doc.page.margins.bottom = originalBottom;
  }
}
