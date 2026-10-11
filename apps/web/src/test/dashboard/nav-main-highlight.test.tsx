import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NavMain } from "@/app/(main)/dashboard/_components/sidebar/nav-main";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { NavGroup } from "@/navigation/sidebar/sidebar-items";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
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

const items: NavGroup[] = [
  {
    id: 1,
    label: "Main",
    items: [
      { title: "Products", url: "/dashboard/products" },
      { title: "AI Chat", url: "/dashboard/chat", highlight: true },
    ],
  },
];

function renderNavMain(defaultOpen: boolean) {
  render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <NavMain items={items} />
    </SidebarProvider>,
  );
}

describe("NavMain highlight", () => {
  it("adds the shine effect and a 'Try it' badge to the highlighted item only", () => {
    renderNavMain(true);

    const chatLink = screen.getByRole("link", { name: /AI Chat/ });
    expect(chatLink).toHaveClass("nav-highlight");
    expect(chatLink).toHaveTextContent("Try it");

    const productsLink = screen.getByRole("link", { name: "Products" });
    expect(productsLink).not.toHaveClass("nav-highlight");
    expect(screen.getAllByText("Try it")).toHaveLength(1);
  });

  it("keeps the shine effect without the badge when the sidebar is collapsed", () => {
    renderNavMain(false);

    const chatLink = screen.getByRole("link", { name: "AI Chat" });
    expect(chatLink).toHaveClass("nav-highlight");
    expect(screen.queryByText("Try it")).not.toBeInTheDocument();
  });
});
