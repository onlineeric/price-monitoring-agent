import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AboutPage from "@/app/(main)/dashboard/about/page";

describe("AboutPage", () => {
  it("renders the page heading and key sections", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: "About This App" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "System Architecture" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What This Project Demonstrates" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tech Stack" })).toBeInTheDocument();
  });

  it("shows the architecture diagram linked to the full-size SVG", () => {
    render(<AboutPage />);

    const diagram = screen.getByRole("img", { name: /system architecture/i });
    expect(diagram).toHaveAttribute("src", "/architecture-phase4.svg");
    expect(diagram.closest("a")).toHaveAttribute("href", "/architecture-phase4.svg");
  });

  it("links to the GitHub repository", () => {
    render(<AboutPage />);

    expect(screen.getByRole("link", { name: "Eric Cheng" })).toHaveAttribute("href", "https://github.com/onlineeric");
    expect(screen.getByRole("link", { name: /github\.com\/onlineeric\/price-monitoring-agent/i })).toHaveAttribute(
      "href",
      "https://github.com/onlineeric/price-monitoring-agent",
    );
  });
});
