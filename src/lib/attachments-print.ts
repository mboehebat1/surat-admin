import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type AttachmentPayload = {
  name: string;
  mimeType: string | null;
  sizeBytes?: number;
  buffer: Buffer;
};

export type PrintMeta = {
  letterNumber?: string | null;
  title?: string | null;
  senderName?: string | null;
};

function isPdf(name: string, mimeType: string | null) {
  return mimeType === "application/pdf" || /\.pdf$/i.test(name);
}

function isPng(name: string, mimeType: string | null) {
  return mimeType === "image/png" || /\.png$/i.test(name);
}

function isJpeg(name: string, mimeType: string | null) {
  return mimeType === "image/jpeg" || /\.jpe?g$/i.test(name);
}

export function isPrintableImage(name: string, mimeType: string | null) {
  return isPng(name, mimeType) || isJpeg(name, mimeType);
}

/**
 * Menambahkan halaman lampiran ke PDF surat.
 *
 * - PDF  → seluruh halaman disalin apa adanya.
 * - PNG/JPEG → ditempatkan pada halaman A4.
 * - Berkas lain (DOCX/XLSX/ZIP/CSV) → dibuatkan halaman keterangan agar
 *   pembaca tahu berkas tersebut menyertai surat.
 *
 * Setiap lampiran didahului halaman penanda "LAMPIRAN n" supaya hasil cetak
 * mudah dipisahkan kembali.
 */
export async function appendAttachmentsToPdf(
  basePdf: Buffer,
  attachments: AttachmentPayload[],
  meta: PrintMeta = {},
): Promise<Buffer> {
  if (!attachments.length) return basePdf;

  const target = await PDFDocument.load(basePdf, { ignoreEncryption: true });
  const font = await target.embedFont(StandardFonts.Helvetica);
  const bold = await target.embedFont(StandardFonts.HelveticaBold);

  for (const [index, attachment] of attachments.entries()) {
    const page = target.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const left = 56;
    page.drawText(`LAMPIRAN ${index + 1}`, {
      x: left,
      y: height - 90,
      size: 16,
      font: bold,
      color: rgb(0.06, 0.09, 0.16),
    });
    page.drawText(attachment.name, {
      x: left,
      y: height - 116,
      size: 11,
      font,
      color: rgb(0.2, 0.25, 0.33),
      maxWidth: width - left * 2,
    });
    const metaLines = [
      meta.letterNumber ? `Nomor surat: ${meta.letterNumber}` : null,
      meta.title ? `Perihal: ${meta.title}` : null,
      meta.senderName ? `Pengirim: ${meta.senderName}` : null,
    ].filter(Boolean) as string[];
    metaLines.forEach((line, lineIndex) => {
      page.drawText(line, {
        x: left,
        y: height - 140 - lineIndex * 16,
        size: 9,
        font,
        color: rgb(0.42, 0.47, 0.55),
        maxWidth: width - left * 2,
      });
    });
    page.drawLine({
      start: { x: left, y: height - 190 },
      end: { x: width - left, y: height - 190 },
      thickness: 1,
      color: rgb(0.8, 0.84, 0.9),
    });

    if (isPdf(attachment.name, attachment.mimeType)) {
      try {
        const source = await PDFDocument.load(attachment.buffer, { ignoreEncryption: true });
        const copied = await target.copyPages(source, source.getPageIndices());
        copied.forEach((copiedPage) => target.addPage(copiedPage));
        continue;
      } catch {
        // PDF terkunci/rusak — jatuh ke halaman keterangan di bawah.
      }
    }

    if (isPrintableImage(attachment.name, attachment.mimeType)) {
      try {
        const image = isPng(attachment.name, attachment.mimeType)
          ? await target.embedPng(attachment.buffer)
          : await target.embedJpg(attachment.buffer);
        const imagePage = target.addPage([595.28, 841.89]);
        const box = { width: 595.28 - left * 2, height: 841.89 - 200 };
        const scale = Math.min(box.width / image.width, box.height / image.height, 1);
        imagePage.drawImage(image, {
          x: (595.28 - image.width * scale) / 2,
          y: (841.89 - image.height * scale) / 2 - 20,
          width: image.width * scale,
          height: image.height * scale,
        });
        continue;
      } catch {
        // gagal menyisipkan gambar — pakai halaman keterangan.
      }
    }

    const notePage = target.addPage([595.28, 841.89]);
    notePage.drawText("Berkas ini disertakan bersama surat, namun tidak dapat digabungkan", {
      x: left,
      y: 641,
      size: 11,
      font,
      color: rgb(0.2, 0.25, 0.33),
    });
    notePage.drawText("otomatis ke dalam PDF. Silakan buka berkas aslinya.", {
      x: left,
      y: 625,
      size: 11,
      font,
      color: rgb(0.2, 0.25, 0.33),
    });
    notePage.drawText(`Nama berkas: ${attachment.name}`, {
      x: left,
      y: 597,
      size: 10,
      font,
      color: rgb(0.42, 0.47, 0.55),
      maxWidth: 595.28 - left * 2,
    });
  }

  return Buffer.from(await target.save());
}
