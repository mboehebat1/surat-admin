/**
 * Klasifikasi baris naskah surat agar tampil rapi pada pratinjau layar
 * maupun pada hasil DOCX/PDF.
 *
 * - `paragraph` : kalimat biasa → menjorok ke dalam (indentasi baris pertama)
 * - `detail`    : baris "Label: nilai" (Nama, NIP, Tempat, …) → rata kiri tanpa indentasi
 * - `list`      : baris bernomor / berbutir ("1. …", "- …", "• …") → menggantung rata kiri
 * - `blank`     : baris kosong sebagai pemisah paragraf
 */
export type LetterLineKind = "blank" | "detail" | "list" | "paragraph";

const LIST_PATTERN = /^\s*(?:\d+[.)]\s|[-•*]\s|[a-z][.)]\s{1,2}\S)/i;
const DETAIL_PATTERN = /^\s*[A-Za-z][A-Za-z0-9 ./&()-]{1,38}:\s+\S/;

export function classifyLetterLine(line: string): LetterLineKind {
  const trimmed = line.trim();
  if (!trimmed) return "blank";
  if (LIST_PATTERN.test(line)) return "list";
  if (DETAIL_PATTERN.test(line)) return "detail";
  return "paragraph";
}

/** Baris yang tidak perlu indentasi baris pertama. */
export function isFlushLine(line: string): boolean {
  const kind = classifyLetterLine(line);
  return kind === "detail" || kind === "list";
}
