import type { ReactNode } from "react";

import { cookies } from "next/headers";

import { SIDEBAR_COLLAPSIBLE_VALUES, SIDEBAR_VARIANT_VALUES } from "@/lib/preferences/layout";
import { getPreference } from "@/server/server-actions";

import { users } from "@/data/users";

import { DashboardClientShell } from "./_components/dashboard-client-shell";

export default async function Layout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  const [variant, collapsible] = await Promise.all([
    getPreference("sidebar_variant", SIDEBAR_VARIANT_VALUES, "inset"),
    getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_VALUES, "icon"),
  ]);

  return (
    <DashboardClientShell
      defaultOpen={defaultOpen}
      variant={variant}
      collapsible={collapsible}
      users={users}
    >
      {children}
    </DashboardClientShell>
  );
}
