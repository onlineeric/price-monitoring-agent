import { describe, expect, it } from "vitest";

import {
  applyContentLayout,
  applyFont,
  applyNavbarStyle,
  applySidebarCollapsible,
  applySidebarVariant,
} from "./layout-utils";

/**
 * The layout-utils functions write `data-*` attributes on <html> that the
 * Tailwind CSS variable theme keys off. Pin each one so a typo in the
 * attribute name (e.g. `data-content-layout` → `data-layout`) breaks tests
 * before it ships to production.
 */

describe("layout-utils", () => {
  it("applyContentLayout writes data-content-layout", () => {
    applyContentLayout("centered");
    expect(document.documentElement.getAttribute("data-content-layout")).toBe("centered");
    applyContentLayout("full-width");
    expect(document.documentElement.getAttribute("data-content-layout")).toBe("full-width");
  });

  it("applyNavbarStyle writes data-navbar-style", () => {
    applyNavbarStyle("sticky");
    expect(document.documentElement.getAttribute("data-navbar-style")).toBe("sticky");
  });

  it("applySidebarVariant writes data-sidebar-variant", () => {
    applySidebarVariant("inset");
    expect(document.documentElement.getAttribute("data-sidebar-variant")).toBe("inset");
  });

  it("applySidebarCollapsible writes data-sidebar-collapsible", () => {
    applySidebarCollapsible("icon");
    expect(document.documentElement.getAttribute("data-sidebar-collapsible")).toBe("icon");
  });

  it("applyFont writes data-font", () => {
    applyFont("inter");
    expect(document.documentElement.getAttribute("data-font")).toBe("inter");
  });
});
