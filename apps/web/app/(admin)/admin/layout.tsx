import { AdminShell } from "@/components/layout/admin-shell";
import { requireRole } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("ADMIN");

  return <AdminShell user={session.user}>{children}</AdminShell>;
}
