import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { NavMain } from "@/app/(main)/dashboard/_components/sidebar/nav-main";
import { SidebarProvider } from "@/components/ui/sidebar";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/send-report",
}));

vi.mock("@/app/(main)/dashboard/_components/product-create/product-create-dialog-provider", () => ({
  useProductCreateDialog: () => ({
    openProductCreateDialog: vi.fn(),
  }),
}));

vi.mock("@/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider", () => ({
  useGlobalProductSearchDialog: () => ({
    openGlobalProductSearch: vi.fn(),
  }),
}));

describe("send-report sidebar route", () => {
  it("registers and renders the Send Report to Emails navigation entry", () => {
    expect(
      sidebarItems.some((group) =>
        group.items.some((item) => item.title === "Send Report to Emails" && item.url === "/dashboard/send-report"),
      ),
    ).toBe(true);

    render(
      <SidebarProvider defaultOpen>
        <NavMain items={sidebarItems} />
      </SidebarProvider>,
    );

    const link = screen.getByRole("link", { name: "Send Report to Emails" });
    expect(link).toHaveAttribute("href", "/dashboard/send-report");
  });
});
