import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { letters } from "@/db/schema";
import { getSessionUser } from "@/lib/auth";
import { canAccessLetter } from "@/lib/api";
import { LetterWizard } from "@/components/letter-wizard";

export const dynamic = "force-dynamic";

export default async function EditLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const letterId = Number(id);
  const rows = await db.select().from(letters).where(eq(letters.id, letterId)).limit(1);
  const letter = rows[0];
  if (!letter) redirect("/surat");
  if (!canAccessLetter(user, letter)) redirect("/surat");

  const editable = ["draft", "revisi", "ditolak"].includes(letter.status);
  if (!editable && user.roleCode !== "super_admin") redirect(`/surat/${letterId}`);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Perbaiki Surat #{letterId}</h1>
        <p className="mt-1 text-sm text-slate-500">
          Status surat: <span className="font-medium">{letter.status}</span>. Riwayat pemeriksaan sebelumnya tetap
          tersimpan; mengirim ulang akan memulai siklus persetujuan baru.
        </p>
      </div>
      <LetterWizard letterId={letterId} />
    </div>
  );
}
