import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const STORAGE_ROOT =
  process.env.STORAGE_DIR ?? path.join(process.cwd(), "storage");

export const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME: Record<string, string[]> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/msword": ["doc"],
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "application/vnd.openxmlformats-excel": ["xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "text/csv": ["csv"],
  "application/zip": ["zip"],
};

const ALLOWED_EXTENSIONS = new Set([
  "docx",
  "doc",
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "xlsx",
  "xls",
  "csv",
  "zip",
]);

export function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function validateUpload(file: { name: string; size: number; type?: string }) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error(`Tipe file ".${extension}" tidak diizinkan.`);
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error("Ukuran file melebihi batas maksimum 10 MB.");
  }
  if (file.size === 0) {
    throw new Error("File kosong atau rusak.");
  }
  if (file.type && !ALLOWED_MIME[file.type]) {
    throw new Error(`MIME type "${file.type}" tidak diizinkan.`);
  }
  return extension;
}

export async function ensureDir(relativeDir: string) {
  const target = path.join(STORAGE_ROOT, relativeDir);
  await mkdir(target, { recursive: true });
  return target;
}

export async function saveBuffer(
  relativeDir: string,
  fileName: string,
  buffer: Buffer,
): Promise<{ storedName: string; storagePath: string }> {
  await ensureDir(relativeDir);
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const storedName = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const storagePath = path.posix.join(relativeDir, storedName);
  await writeFile(path.join(STORAGE_ROOT, storagePath), buffer);
  return { storedName, storagePath };
}

export async function readStoredFile(storagePath: string): Promise<Buffer> {
  const absolute = path.join(STORAGE_ROOT, storagePath);
  if (!absolute.startsWith(STORAGE_ROOT)) {
    throw new Error("Path file tidak valid.");
  }
  return readFile(absolute);
}

export async function fileExists(storagePath: string): Promise<boolean> {
  try {
    await readStoredFile(storagePath);
    return true;
  } catch {
    return false;
  }
}

export async function saveUploadedFile(relativeDir: string, file: File) {
  validateUpload({ name: file.name, size: file.size, type: file.type });
  const buffer = Buffer.from(await file.arrayBuffer());
  const stored = await saveBuffer(relativeDir, file.name, buffer);
  return { ...stored, buffer, sizeBytes: file.size, mimeType: file.type };
}
