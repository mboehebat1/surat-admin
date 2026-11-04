import PizZip from "pizzip";

export type DocxAttachmentItem = {
  name: string;
  mimeType?: string | null;
  sizeBytes?: number;
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraph(text: string, options: { bold?: boolean; center?: boolean; size?: number } = {}) {
  const runProps = `${options.bold ? "<w:b/>" : ""}${options.size ? `<w:sz w:val="${options.size}"/>` : ""}`;
  const paraProps = options.center ? '<w:pPr><w:jc w:val="center"/></w:pPr>' : "";
  return `<w:p>${paraProps}<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

/**
 * Menambahkan bagian LAMPIRAN pada akhir dokumen DOCX.
 *
 * Word menaruh `<w:sectPr>` sebagai anak terakhir `<w:body>`, jadi paragraf baru
 * harus disisipkan tepat sebelum elemen tersebut agar dokumen tetap valid.
 */
export function appendAttachmentsSection(
  docxBuffer: Buffer,
  items: DocxAttachmentItem[],
  meta: { letterNumber?: string | null; title?: string | null } = {},
): Buffer {
  if (!items.length) return docxBuffer;
  try {
    const zip = new PizZip(docxBuffer);
    const documentFile = zip.file("word/document.xml");
    if (!documentFile) return docxBuffer;
    const xml = documentFile.asText();
    if (/LAMPIRAN DOKUMEN PENDUKUNG/.test(xml)) return docxBuffer; // sudah ada

    const blocks: string[] = [pageBreak(), paragraph("LAMPIRAN DOKUMEN PENDUKUNG", { bold: true, center: true, size: 28 })];
    const metaLine = [meta.letterNumber ? `Nomor: ${meta.letterNumber}` : null, meta.title ? `Perihal: ${meta.title}` : null]
      .filter(Boolean)
      .join("  ·  ");
    if (metaLine) blocks.push(paragraph(metaLine, { center: true, size: 18 }));
    blocks.push(paragraph(""));

    items.forEach((item, index) => {
      const size = item.sizeBytes ? ` (${Math.max(1, Math.round(item.sizeBytes / 1024))} KB)` : "";
      blocks.push(paragraph(`Lampiran ${index + 1}. ${item.name}${size}`));
    });

    blocks.push(paragraph(""));
    blocks.push(
      paragraph(
        "Berkas lampiran disertakan bersama surat ini. Hasil cetak/PDF gabungan memuat isi lampiran setelah halaman surat.",
        { size: 18 },
      ),
    );

    const marker = "<w:sectPr";
    const insertion = blocks.join("");
    const index = xml.lastIndexOf(marker);
    const updated = index >= 0 ? xml.slice(0, index) + insertion + xml.slice(index) : xml.replace("</w:body>", `${insertion}</w:body>`);
    zip.file("word/document.xml", updated);
    return zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  } catch {
    return docxBuffer;
  }
}
