import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const actor = await requireUser();
    await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(notifications.userId, actor.id));
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
