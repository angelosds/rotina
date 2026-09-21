import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await requireUser();
  if (!session.profile.onboarded) redirect("/boas-vindas");

  return (
    <AppShell isOwner={session.profile.role === "owner"}>{children}</AppShell>
  );
}
