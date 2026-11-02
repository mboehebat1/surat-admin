import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LetterWizard } from "@/components/letter-wizard";

export const dynamic = "force-dynamic";

export default async function NewLetterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.permissions.includes("surat.buat")) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Buat Surat Baru</h1>
        <p className="mt-1 text-sm text-slate-500">
          Pilih kategori dan template — sistem mendeteksi placeholder <span className="font-mono">{"{{field}}"}</span> dan
          menyusun formulir secara otomatis. Draft tersimpan otomatis saat Anda mengetik.
        </p>
      </div>
      <LetterWizard />
    </div>
  );
}
