import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "@/app/(main)/dashboard/chat/_components/markdown-content";

describe("MarkdownContent — sanitization & rendering", () => {
  it("renders bullet lists", () => {
    const { container } = render(
      <MarkdownContent text={"- one\n- two\n- three"} />,
    );
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("one");
  });

  it("renders bold and italic", () => {
    const { container } = render(<MarkdownContent text={"**bold** _italic_"} />);
    // Streamdown wraps emphasis in semantic styled spans/elements with a
    // `data-streamdown` marker. We assert the visible text is rendered with
    // strong-emphasis styling rather than as literal asterisks.
    expect(container.querySelector('[data-streamdown="strong"]')?.textContent).toBe(
      "bold",
    );
    expect(container.querySelector("em")?.textContent).toBe("italic");
    // The asterisks must not appear as literal characters.
    expect(container.textContent).not.toContain("**");
  });

  it("renders fenced code blocks", () => {
    const { container } = render(
      <MarkdownContent text={"```js\nconst x = 1;\n```"} />,
    );
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain("const x = 1;");
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownContent text={"hello `world`"} />);
    const code = container.querySelector("code");
    expect(code?.textContent).toBe("world");
  });

  it("renders link text for http(s) markdown links", () => {
    // Streamdown wraps external links in a confirmation control by default
    // (link-safety modal). The visible text is what the user clicks; the
    // destination URL is held internally and surfaced via the modal.
    render(<MarkdownContent text={"[ok](https://example.com)"} />);
    const link = screen.getByText("ok");
    expect(link).toBeInTheDocument();
    // The link element must NOT have its href set to a script-execution scheme.
    const href = link.getAttribute("href") ?? "";
    expect(href.toLowerCase()).not.toContain("javascript:");
  });

  it("does not render <script> tags from raw HTML in input", () => {
    const { container } = render(
      <MarkdownContent text={"hello <script>alert(1)</script> there"} />,
    );
    expect(container.querySelector("script")).toBeNull();
  });

  it("strips javascript: URLs from links (renders inert href)", () => {
    const { container } = render(
      <MarkdownContent text={"[click me](javascript:alert(1))"} />,
    );
    const link = container.querySelector("a");
    if (link) {
      const href = link.getAttribute("href") ?? "";
      expect(href.toLowerCase()).not.toContain("javascript:");
    }
    // If the renderer omits the link entirely, that is also acceptable.
  });

  it("does not render <iframe> from raw HTML", () => {
    const { container } = render(
      <MarkdownContent text={"x <iframe src=\"https://evil.com\"></iframe> y"} />,
    );
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("passes plain text through unchanged", () => {
    render(<MarkdownContent text={"just plain prose with no formatting"} />);
    expect(
      screen.getByText("just plain prose with no formatting"),
    ).toBeInTheDocument();
  });
});
