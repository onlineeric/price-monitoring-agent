import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NavMain } from "@/app/(main)/dashboard/_components/sidebar/nav-main";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { NavGroup } from "@/navigation/sidebar/sidebar-items";

const openGlobalProductSearch = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/default",
}));

vi.mock("@/app/(main)/dashboard/_components/product-create/product-create-dialog-provider", () => ({
  useProductCreateDialog: () => ({
    openProductCreateDialog: vi.fn(),
  }),
}));

vi.mock("@/app/(main)/dashboard/_components/product-search/global-product-search-dialog-provider", () => ({
  useGlobalProductSearchDialog: () => ({
    openGlobalProductSearch,
  }),
}));

const items: NavGroup[] = [
  {
    id: 1,
    label: "Main",
    items: [],
  },
];

describe("NavMain search trigger", () => {
  it("reuses the global product search flow from the sidebar icon button", async () => {
    const user = userEvent.setup();

    render(
      <SidebarProvider defaultOpen>
        <NavMain items={items} />
      </SidebarProvider>,
    );

    const searchButton = screen.getByRole("button", { name: "Search" });

    await user.click(searchButton);

    expect(openGlobalProductSearch).toHaveBeenCalledTimes(1);
    expect(openGlobalProductSearch).toHaveBeenCalledWith({
      source: "sidebar-search-button",
      trigger: searchButton,
    });
    expect(screen.queryByRole("button", { name: "Inbox" })).not.toBeInTheDocument();
  });
});
