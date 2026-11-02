import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk, readJson } from "@/lib/api";
import { actOnLetter, submitLetter, type LetterAction } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["submit", "review", "approve", "reject", "revision", "distribute", "archive"]),
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const letterId = Number(id);
    const payload = actionSchema.parse(await readJson(request));

    if (payload.action === "submit") {
      const result = await submitLetter(letterId, actor);
      return jsonOk(result);
    }

    const result = await actOnLetter(letterId, actor, payload.action as LetterAction, payload.note ?? null);
    return jsonOk(result);
  } catch (error) {
    return jsonError(error);
  }
}
