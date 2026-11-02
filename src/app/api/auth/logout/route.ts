import { clearSessionCookie, getSessionUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getSessionUser();
    await clearSessionCookie();
    if (user) {
      await logAudit({
        actor: user,
        action: "logout",
        entity: "users",
        entityId: user.id,
        description: `${user.name} keluar dari sistem`,
      });
    }
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
