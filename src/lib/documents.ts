import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
} from "docx";
import PDFDocument from "pdfkit";
import { readStoredFile } from "@/lib/storage";
import { formatDateID } from "@/lib/status";

export const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export type LetterDocumentInput = {
  number: string;
  date: string;
  title: string;
  recipientName: string;
  recipientPosition: string;
  recipientAddress: string;
  bodyText: string;
  kopText: string;
  signerName: string;
  signerPosition: string;
  signerNip?: string | null;
  senderName: string;
  senderPosition: string;
  classification: string;
  attachments: string[];
  data: Record<string, unknown>;
};

export function extractPlaceholders(text: string): string[] {
  const found: string[] = [];
  if (!text) return found;
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

export async function extractPlaceholdersFromDocx(buffer: Buffer): Promise<string[]> {
  const zip = new PizZip(buffer);
  const parts = ["word/document.xml", "word/header1.xml", "word/header2.xml", "word/footer1.xml"];
  const found: string[] = [];
  for (const part of parts) {
    const file = zip.file(part);
    if (!file) continue;
    const xml = file.asText();
    // Word kerap memecah tag {{ }} menjadi beberapa run — gabungkan dulu.
    const flat = xml.replace(/<[^>]+>/g, "");
    for (const key of extractPlaceholders(flat)) {
      if (!found.includes(key)) found.push(key);
    }
  }
  return found;
}

export function renderTemplateText(template: string, data: Record<string, unknown>): string {
  if (!template) return "";
  return template.replace(new RegExp(PLACEHOLDER_REGEX.source, "g"), (_m, key: string) => {
    const value = data[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

const SYSTEM_KEYS = [
  "nomor_surat",
  "tanggal_surat",
  "tanggal_lengkap",
  "nama_penerima",
  "jabatan_penerima",
  "alamat_penerima",
  "perihal",
  "isi_surat",
  "nama_pembuat",
  "jabatan_pembuat",
  "nama_penandatangan",
  "jabatan_penandatangan",
  "nip_penandatangan",
  "lampiran",
  "klasifikasi",
  "kop_surat",
];

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
    klasifikasi: input.classification || "Biasa",
    kop_surat: input.kopText || "",
  });
  return data;
}

/** Render DOCX dari template unggahan; jika gagal/tidak ada, bangun dokumen standar. */
export async function generateDocx(
  input: LetterDocumentInput,
  templateDocxPath?: string | null,
): Promise<Buffer> {
  const data = buildDocumentData(input);

  if (templateDocxPath) {
    try {
      const source = await readStoredFile(templateDocxPath);
      const zip = new PizZip(source);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => "",
      });
      doc.render(data);
      return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
    } catch {
      // fallback ke dokumen standar
    }
  }

  const paragraphs: Paragraph[] = [];
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
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120 },
        indent: { firstLine: 400 },
        children: [new TextRun({ text: paragraph, size: 24, font: "Times New Roman" })],
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

  paragraphs.push(
    new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: "Hormat kami,", size: 24, font: "Times New Roman" })] }),
    new Paragraph({ children: [new TextRun({ text: data.jabatan_penandatangan || input.signerPosition, size: 24, font: "Times New Roman" })] }),
    new Paragraph({ spacing: { before: 700 }, children: [new TextRun({ text: input.signerName, size: 24, font: "Times New Roman", bold: true, underline: {} })] }),
  );
  if (input.signerNip) {
    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: `NIP. ${input.signerNip}`, size: 24, font: "Times New Roman" })],
      }),
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

  const doc = new Document({
    creator: "E-SURAT",
    title: input.title,
    sections: [{ properties: {}, children: paragraphs }],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function generatePdf(input: LetterDocumentInput): Promise<Buffer> {
  const data = buildDocumentData(input);
  const doc = new PDFDocument({ size: "A4", margin: 70, info: { Title: input.title, Author: "E-SURAT" } });
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
    doc.text(paragraph.trim(), leftX, doc.y, {
      width: pageWidth,
      align: "justify",
      paragraphGap: 6,
      indent: 20,
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

  doc.moveDown(1.6);
  const signatureY = Math.max(doc.y, doc.page.height - 210);
  const signatureX = leftX + pageWidth - 230;
  doc.font("Helvetica").text("Hormat kami,", signatureX, signatureY, { width: 230 });
  doc.text(data.jabatan_penandatangan || input.signerPosition, signatureX, doc.y, { width: 230 });
  doc.moveDown(2.6);
  doc.font("Helvetica-Bold").text(input.signerName || "-", signatureX, doc.y, { width: 230 });
  doc.font("Helvetica");
  if (input.signerNip) doc.text(`NIP. ${input.signerNip}`, signatureX, doc.y, { width: 230 });

  doc
    .fontSize(8)
    .fillColor("#64748b")
    .text(
      `Disetujui secara elektronik melalui sistem E-SURAT. Dokumen sah tanpa tanda tangan basah dan stempel.`,
      leftX,
      doc.page.height - 55,
      { width: pageWidth, align: "center" },
    );

  doc.end();
  return done;
}
