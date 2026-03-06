"use client";

import type { ReactNode } from "react";

import { AppSidebar } from "@/app/(main)/dashboard/_components/sidebar/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { ProductCreateDialogProvider } from "./product-create/product-create-dialog-provider";
import { AccountSwitcher } from "./sidebar/account-switcher";
import { LayoutControls } from "./sidebar/layout-controls";
import { SearchDialog } from "./sidebar/search-dialog";
import { ThemeSwitcher } from "./sidebar/theme-switcher";

interface DashboardClientShellProps {
  children: ReactNode;
  defaultOpen: boolean;
  variant: React.ComponentProps<typeof AppSidebar>["variant"];
  collapsible: React.ComponentProps<typeof AppSidebar>["collapsible"];
  users: React.ComponentProps<typeof AccountSwitcher>["users"];
}

export function DashboardClientShell({
  children,
  defaultOpen,
  variant,
  collapsible,
  users,
}: DashboardClientShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <ProductCreateDialogProvider>
        <AppSidebar variant={variant} collapsible={collapsible} />
        <SidebarInset
          className={cn(
            "[html[data-content-layout=centered]_&]:mx-auto! [html[data-content-layout=centered]_&]:max-w-screen-2xl!",
            "max-[113rem]:peer-data-[variant=inset]:mr-2! min-[101rem]:peer-data-[variant=inset]:peer-data-[state=collapsed]:mr-auto!",
          )}
        >
          <header
            className={cn(
              "flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
              "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:overflow-hidden [html[data-navbar-style=sticky]_&]:rounded-t-[inherit] [html[data-navbar-style=sticky]_&]:bg-background/50 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
            )}
          >
            <div className="flex w-full items-center justify-between px-4 lg:px-6">
              <div className="flex items-center gap-1 lg:gap-2">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
                <SearchDialog />
              </div>
              <div className="flex items-center gap-2">
                <LayoutControls />
                <ThemeSwitcher />
                <AccountSwitcher users={users} />
              </div>
            </div>
          </header>
          <div className="h-full p-4 md:p-6">{children}</div>
        </SidebarInset>
      </ProductCreateDialogProvider>
    </SidebarProvider>
  );
}
