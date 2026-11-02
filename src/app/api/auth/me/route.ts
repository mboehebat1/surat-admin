import { getSessionUser } from "@/lib/auth";
import { jsonError, jsonOk } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return jsonOk({ user: null }, 401);
    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}
