import { jsonError, jsonOk } from "@/lib/api";
import { ensureAnnouncementSeed, listPublishedAnnouncements } from "@/lib/announcements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Endpoint publik (tanpa login) untuk berita terkini di halaman login.
 * Hanya mengembalikan berita yang sudah dipublikasikan.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 4) || 4, 1), 10);
    await ensureAnnouncementSeed();
    const items = await listPublishedAnnouncements(limit);
    return jsonOk({ items });
  } catch (error) {
    return jsonError(error);
  }
}
