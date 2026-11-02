/**
 * Utilitas placeholder surat — dipakai bersama oleh server (render DOCX/PDF)
 * dan client (deteksi field langsung saat menulis naskah).
 *
 * Format yang didukung dan setara satu sama lain:
 *
 *   {{nama_field}}   <<nama_field>>   ${nama_field}   [nama_field]
 *
 * Aturan nama field: huruf, angka, garis bawah, dan titik (mis. `data.instansi`).
 */

export type PlaceholderSyntax = {
  id: string;
  /** Label ringkas untuk UI, mis. `{{field}}`. */
  label: string;
  /** Deskripsi singkat asal gaya penulisan. */
  description: string;
  /** Contoh penulisan. */
  sample: string;
  pattern: RegExp;
  /**
   * `[field]` satu-satunya pola yang rawan salah tangkap, karena kurung siku
   * lazim dipakai untuk hal lain: `[1]`, `[catatan]`, `[teks](tautan)`.
   */
  strict?: boolean;
};

export const PLACEHOLDER_SYNTAXES: PlaceholderSyntax[] = [
  {
    id: "kurawal-ganda",
    label: "{{field}}",
    description: "Format standar aplikasi",
    sample: "{{perihal}}",
    pattern: /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g,
  },
  {
    id: "kurung-siku-ganda",
    label: "<<field>>",
    description: "Lazim di template Word lama",
    sample: "<<perihal>>",
    pattern: /<<\s*([a-zA-Z0-9_.]+)\s*>>/g,
  },
  {
    id: "dolar-kurawal",
    label: "${field}",
    description: "Gaya ekspresi / template Excel",
    sample: "${perihal}",
    pattern: /\$\{\s*([a-zA-Z0-9_.]+)\s*\}/g,
  },
  {
    id: "kurung-siku",
    label: "[field]",
    description: "Wajib huruf kecil bergaris bawah",
    sample: "[nama_kegiatan]",
    pattern: /\[\s*([a-zA-Z0-9_.]+)\s*\]/g,
    strict: true,
  },
];

/** Pola kanonik — dipakai render DOCX dan kompatibilitas kode lama. */
export const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Nama field bawaan sistem yang selalu tersedia saat surat dibuat. */
export const SYSTEM_KEYS = [
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

/** Kata dalam kurung siku yang hampir pasti bukan placeholder. */
const BRACKET_STOPWORDS = new Set([
  "catatan",
  "opsional",
  "wajib",
  "kosong",
  "contoh",
  "lihat",
  "baca",
  "edit",
  "hapus",
  "ubah",
  "baru",
  "lama",
  "ya",
  "tidak",
  "selesai",
  "draf",
]);

/**
 * Apakah teks dalam `[...]` layak dianggap placeholder?
 * - nama sistem (`perihal`, `nomor_surat`, …) selalu diterima,
 * - nama field yang sudah dikenal template diterima,
 * - selain itu wajib snake_case minimal 3 karakter (mis. `nama_kegiatan`),
 * sehingga `[1]`, `[catatan]`, dan `[teks](tautan)` tidak ikut tertangkap.
 */
export function isStrictPlaceholderCandidate(key: string, knownKeys: Set<string>): boolean {
  if (knownKeys.has(key)) return true;
  if (BRACKET_STOPWORDS.has(key.toLowerCase())) return false;
  if (key.length < 3) return false;
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(key);
}

export type PlaceholderOptions = {
  /** Nama field tambahan yang sudah dikenal (mis. field milik template). */
  knownKeys?: Iterable<string>;
};

function resolveKnownKeys(options: PlaceholderOptions): Set<string> {
  return new Set<string>([...SYSTEM_KEYS, ...(options.knownKeys ?? [])]);
}

/** Ambil semua placeholder dari teks, apa pun formatnya (tanpa duplikat). */
export function extractPlaceholders(text: string, options: PlaceholderOptions = {}): string[] {
  const found: string[] = [];
  if (!text) return found;
  const knownKeys = resolveKnownKeys(options);
  for (const syntax of PLACEHOLDER_SYNTAXES) {
    const regex = new RegExp(syntax.pattern.source, "g");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const key = match[1];
      if (syntax.strict && !isStrictPlaceholderCandidate(key, knownKeys)) continue;
      if (!found.includes(key)) found.push(key);
    }
  }
  return found;
}

/** Isi semua placeholder dengan data yang tersedia. */
export function renderPlaceholders(
  template: string,
  data: Record<string, unknown>,
  options: PlaceholderOptions = {},
): string {
  if (!template) return "";
  const knownKeys = new Set<string>([...resolveKnownKeys(options), ...Object.keys(data)]);
  let result = template;
  for (const syntax of PLACEHOLDER_SYNTAXES) {
    const regex = new RegExp(syntax.pattern.source, "g");
    result = result.replace(regex, (whole: string, key: string) => {
      if (syntax.strict && !isStrictPlaceholderCandidate(key, knownKeys)) return whole;
      const value = data[key];
      if (value === undefined || value === null) return "";
      return String(value);
    });
  }
  return result;
}

const XML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&amp;": "&",
  "&quot;": '"',
  "&apos;": "'",
};

/** Kembalikan entitas XML ke karakter aslinya — hanya untuk membaca/mendeteksi. */
export function decodeXmlEntities(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos);/g, (entity) => XML_ENTITIES[entity] ?? entity);
}

/**
 * Seperti `normalizePlaceholders`, tetapi sadar entitas XML.
 * Di dalam DOCX, `<<` tersimpan sebagai `&lt;&lt;` sehingga pola biasa tidak
 * akan cocok. Penggantian tetap menghasilkan `{{field}}` agar XML tetap valid.
 */
export function normalizeDocxPlaceholders(
  xml: string,
  options: PlaceholderOptions = {},
): string {
  if (!xml) return "";
  const knownKeys = resolveKnownKeys(options);
  let result = xml;
  for (const syntax of PLACEHOLDER_SYNTAXES) {
    if (syntax.id === "kurawal-ganda") continue;
    const source =
      syntax.id === "kurung-siku-ganda"
        ? "(?:&lt;&lt;|<<)\\s*([a-zA-Z0-9_.]+)\\s*(?:&gt;&gt;|>>)"
        : syntax.pattern.source;
    result = result.replace(new RegExp(source, "g"), (whole: string, key: string) => {
      if (syntax.strict && !isStrictPlaceholderCandidate(key, knownKeys)) return whole;
      return `{{${key}}}`;
    });
  }
  return result;
}

/**
 * Ubah semua format placeholder menjadi bentuk kanonik `{{field}}`.
 * Dipakai sebelum render DOCX karena docxtemplater hanya mengenal satu gaya.
 */
export function normalizePlaceholders(text: string, options: PlaceholderOptions = {}): string {
  if (!text) return "";
  const knownKeys = resolveKnownKeys(options);
  let result = text;
  for (const syntax of PLACEHOLDER_SYNTAXES) {
    if (syntax.id === "kurawal-ganda") continue;
    const regex = new RegExp(syntax.pattern.source, "g");
    result = result.replace(regex, (whole: string, key: string) => {
      if (syntax.strict && !isStrictPlaceholderCandidate(key, knownKeys)) return whole;
      return `{{${key}}}`;
    });
  }
  return result;
}
