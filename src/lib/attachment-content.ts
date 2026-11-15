import PizZip from "pizzip";

/**
 * Ekstraksi isi dokumen pendukung agar dapat dicetak menyatu dengan surat.
 *
 * Word/Excel tidak bisa dirender menjadi PDF di server tanpa LibreOffice, jadi
 * isinya dibaca sebagai teks (paragraf/tabel/sel) lalu digambar ke halaman PDF.
 * Dengan begitu lampiran tetap "tampil penuh" di dokumen cetak, bukan sekadar
 * halaman keterangan nama berkas.
 */

export type ExtractedBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "line"; text: string };

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function xmlText(xml: string): string {
  return decodeXml(xml.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** Baca paragraf dari `word/document.xml` (termasuk isi tabel). */
export function extractDocxText(buffer: Buffer): ExtractedBlock[] {
  const zip = new PizZip(buffer);
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) return [];

  const xml = documentFile.asText();
  const blocks: ExtractedBlock[] = [];

  for (const paragraph of xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? []) {
    const text = xmlText(paragraph).replace(/\s+/g, " ").trim();
    if (!text) continue;
    const isHeading = /<w:pStyle[^>]*w:val="(Heading|Title)/i.test(paragraph);
    blocks.push(isHeading ? { kind: "heading", text } : { kind: "paragraph", text });
  }

  // Paragraf di dalam tabel tetap terbaca lewat pola <w:p> di atas, namun bila
  // dokumen hanya berisi tabel tanpa <w:p> di luar tabel, hasilnya tetap lengkap.
  return blocks;
}

/** Baca isi spreadsheet (`xl/worksheets/*.xml`) sebagai baris teks. */
export function extractXlsxText(buffer: Buffer): ExtractedBlock[] {
  const zip = new PizZip(buffer);
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedFile) {
    for (const si of sharedFile.asText().match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
      shared.push(xmlText(si));
    }
  }

  const sheetNames = Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => {
      const num = (value: string) => Number(value.match(/sheet(\d+)/)?.[1] ?? 0);
      return num(a) - num(b);
    });

  const blocks: ExtractedBlock[] = [];
  sheetNames.forEach((name, sheetIndex) => {
    const file = zip.file(name);
    if (!file) return;
    blocks.push({ kind: "heading", text: `Lembar ${sheetIndex + 1}` });
    const rows = file.asText().match(/<row\b[\s\S]*?<\/row>/g) ?? [];
    for (const row of rows) {
      const cells: string[] = [];
      for (const cell of row.match(/<c\b[\s\S]*?<\/c>/g) ?? []) {
        const type = cell.match(/t="([^"]+)"/)?.[1];
        const rawValue = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        if (type === "s") {
          cells.push(shared[Number(rawValue)] ?? "");
        } else if (type === "inlineStr") {
          cells.push(xmlText(cell));
        } else {
          cells.push(decodeXml(rawValue).trim());
        }
      }
      const line = cells.filter((value) => value !== "").join("  |  ");
      if (line) blocks.push({ kind: "line", text: line });
    }
  });
  return blocks;
}

/** Teks biasa (CSV/TXT/JSON) — dipecah per baris. */
export function extractPlainText(buffer: Buffer): ExtractedBlock[] {
  const text = buffer.toString("utf8");
  if (!text || text.includes("\u0000")) return [];
  return text
    .split(/\r?\n/)
    .slice(0, 800)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ kind: "line" as const, text: line }));
}

/**
 * Membaca isi berkas ZIP: setiap entri yang bisa dibaca sebagai teks
 * (DOCX/XLSX/TXT/CSV/MD) diekstrak dan diberi judul nama berkasnya, supaya
 * lampiran ZIP tidak lagi hanya berupa halaman keterangan.
 *
 * Entri biner (gambar/PDF) tidak bisa ditempel ke halaman teks, jadi hanya
 * dicatat namanya agar pembaca tahu berkas apa saja di dalam ZIP.
 */
export function extractZipText(buffer: Buffer): ExtractedBlock[] {
  const zip = new PizZip(buffer);
  const blocks: ExtractedBlock[] = [];
  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir)
    .filter((name) => !/(^|\/)(__MACOSX|\.[^/]*)$/.test(name))
    .sort();

  const MAX_ENTRIES = 40;
  const MAX_BLOCKS = 900;
  let skipped = 0;

  for (const name of names.slice(0, MAX_ENTRIES)) {
    const file = zip.files[name];
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    blocks.push({ kind: "heading", text: `Berkas: ${name}` });

    if (["docx", "xlsx", "txt", "csv", "md", "json", "log"].includes(extension)) {
      try {
        const inner = extractAttachmentText(name, null, file.asNodeBuffer());
        if (inner?.length) {
          blocks.push(...inner.slice(0, 300));
        } else {
          blocks.push({ kind: "line", text: "(isi berkas tidak dapat dibaca)" });
        }
      } catch {
        blocks.push({ kind: "line", text: "(isi berkas tidak dapat dibaca)" });
      }
    } else {
      blocks.push({
        kind: "line",
        text: `(berkas .${extension || "?"} tidak dapat ditampilkan sebagai teks — buka berkas aslinya)`,
      });
    }

    if (blocks.length >= MAX_BLOCKS) {
      skipped = names.length - names.slice(0, MAX_ENTRIES).indexOf(name) - 1;
      break;
    }
  }

  if (names.length > MAX_ENTRIES) {
    blocks.push({
      kind: "line",
      text: `… ${names.length - MAX_ENTRIES} berkas lain di dalam ZIP tidak ditampilkan.`,
    });
  } else if (skipped > 0) {
    blocks.push({ kind: "line", text: `… ${skipped} berkas lain tidak ditampilkan.` });
  }

  return blocks;
}

export function extractAttachmentText(
  name: string,
  mimeType: string | null,
  buffer: Buffer,
): ExtractedBlock[] | null {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  try {
    if (extension === "zip") return extractZipText(buffer);
    if (extension === "docx") return extractDocxText(buffer);
    if (extension === "xlsx") return extractXlsxText(buffer);
    if (["txt", "csv", "json", "md", "log"].includes(extension) || mimeType?.startsWith("text/")) {
      return extractPlainText(buffer);
    }
  } catch {
    return null;
  }
  return null;
}
