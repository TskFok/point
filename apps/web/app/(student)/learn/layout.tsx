import { StudentShell } from "@/components/layout/student-shell";
import { requireRole } from "@/lib/auth/session";

export default async function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole("STUDENT");

  return <StudentShell user={session.user}>{children}</StudentShell>;
}
