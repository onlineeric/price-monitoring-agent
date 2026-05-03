import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SimpleIcon } from "./simple-icon";

/**
 * SimpleIcon is the tiny adapter the dashboard uses to render brand glyphs
 * from the `simple-icons` package. The test pins the accessibility shape
 * (title, aria-label) and the viewBox so a future refactor can't strip them.
 */

const fakeIcon = {
  title: "TestBrand",
  slug: "testbrand",
  hex: "ff0000",
  path: "M0 0h24v24H0z",
  source: "https://example.com",
} as unknown as Parameters<typeof SimpleIcon>[0]["icon"];

describe("<SimpleIcon />", () => {
  it("renders an svg with the icon's title for screen readers", () => {
    const { container } = render(<SimpleIcon icon={fakeIcon} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-label")).toBe("TestBrand");
    expect(svg?.querySelector("title")?.textContent).toBe("TestBrand");
  });

  it("renders the path data from the icon definition", () => {
    const { container } = render(<SimpleIcon icon={fakeIcon} />);
    expect(container.querySelector("path")?.getAttribute("d")).toBe("M0 0h24v24H0z");
  });

  it("preserves the 24×24 viewBox so brand glyphs scale correctly", () => {
    const { container } = render(<SimpleIcon icon={fakeIcon} />);
    expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("merges caller-provided className with the default classes", () => {
    const { container } = render(<SimpleIcon icon={fakeIcon} className="text-blue-500" />);
    const cls = container.querySelector("svg")?.getAttribute("class") ?? "";
    expect(cls).toContain("text-blue-500");
  });
});
