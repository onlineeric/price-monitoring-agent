import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { USER_MENU_LINKS, UserMenuLinks } from "./user-menu-links";

function renderOpenMenu() {
  render(
    <DropdownMenu open>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <UserMenuLinks />
      </DropdownMenuContent>
    </DropdownMenu>,
  );
}

describe("UserMenuLinks", () => {
  it("renders every link as a menu item that opens in a new tab", () => {
    renderOpenMenu();

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(USER_MENU_LINKS.length);

    for (const { label, href } of USER_MENU_LINKS) {
      const link = screen.getByRole("menuitem", { name: label });
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });
});
