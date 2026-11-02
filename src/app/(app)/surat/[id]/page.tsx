import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccessLetter } from "@/lib/api";
import { fetchLetterDetail } from "@/lib/queries";
import { LetterDetailView } from "@/components/letter-detail";
import { EmptyState, Card } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function LetterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const detail = await fetchLetterDetail(Number(id));

  if (!detail) {
    return (
      <Card>
        <EmptyState title="Surat tidak ditemukan" description="Data surat mungkin telah dihapus atau nomor surat salah." />
      </Card>
    );
  }
  if (!canAccessLetter(user, detail.letter)) redirect("/surat");

  const serialized = JSON.parse(JSON.stringify(detail)) as Parameters<typeof LetterDetailView>[0]["detail"];

  return (
    <LetterDetailView
      detail={serialized}
      actor={{ id: user.id, roleCode: user.roleCode, permissions: user.permissions }}
    />
  );
}
