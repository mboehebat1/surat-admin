import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { AppShell } from "@/components/shell";
import { ToastProvider } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <ToastProvider>
      <AppShell
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          roleCode: user.roleCode,
          roleName: user.roleName,
          departmentName: user.departmentName,
          position: user.position,
          permissions: user.permissions,
        }}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
