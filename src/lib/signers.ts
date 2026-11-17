/**
 * Penanda tangan surat (maksimal 4) — dipakai bersama oleh server (PDF/DOCX)
 * dan client (formulir & pratinjau), sehingga tidak boleh mengimpor `@/db`.
 *
 * Penanda tangan diatur per surat (bukan per template), tetapi saat memilih
 * template formulir otomatis terisi dari `signerName` / `signerPosition`
 * template agar pengguna tidak mengetik ulang.
 */

export type LetterSigner = {
  /** Label di atas nama, mis. "Hormat kami" / "Mengetahui". */
  label: string;
  name: string;
  position: string;
  nip: string;
};

export const MAX_SIGNERS = 4;

export const SIGNER_LABEL_PRESETS = ["Hormat kami", "Mengetahui", "Menyetujui", "Menerima"] as const;

export function emptySigner(label = "Hormat kami"): LetterSigner {
  return { label, name: "", position: "", nip: "" };
}

/** Bersihkan data dari klien/DB: batasi 4, buang yang tanpa nama, rapikan spasi. */
export function normalizeSigners(input: unknown): LetterSigner[] {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, MAX_SIGNERS)
    .map((raw) => {
      const item = (raw ?? {}) as Record<string, unknown>;
      const text = (value: unknown, max: number) =>
        typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
      return {
        label: text(item.label, 60) || "Hormat kami",
        name: text(item.name, 120),
        position: text(item.position, 160),
        nip: text(item.nip, 40),
      };
    })
    .filter((signer) => signer.name.length > 0);
}

/**
 * Susunan kolom tanda tangan pada halaman cetak:
 * 1 → satu blok di kanan, 2 → dua kolom, 3 → tiga kolom, 4 → 2×2.
 */
export function signerColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 2;
}
