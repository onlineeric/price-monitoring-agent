import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ToolCallIndicator } from "@/app/(main)/dashboard/chat/_components/tool-call-indicator";
import type { ToolCallEvent } from "@/stores/chat/types";

function makeEvent(overrides: Partial<ToolCallEvent>): ToolCallEvent {
  return {
    id: "call-1",
    toolName: "search_products",
    status: "completed",
    args: { q: "monitor" },
    result: { rows: [{ id: 1, name: "Sony" }] },
    ...overrides,
  } as ToolCallEvent;
}

describe("ToolCallIndicator — expandable trace (task 3.7)", () => {
  it("renders the pill collapsed by default with the tool name and status", () => {
    render(<ToolCallIndicator event={makeEvent({ status: "completed" })} />);

    const indicator = screen.getByTestId("tool-call-indicator");
    expect(indicator).toHaveAttribute("data-tool-name", "search_products");
    expect(indicator).toHaveAttribute("data-tool-status", "completed");
    expect(indicator).toHaveAttribute("data-tool-expanded", "false");

    expect(screen.queryByTestId("tool-call-details")).not.toBeInTheDocument();
  });

  it("expands on click to reveal pretty-printed args and result", () => {
    render(
      <ToolCallIndicator
        event={makeEvent({
          status: "completed",
          args: { q: "monitor", limit: 5 },
          result: { rows: [{ id: 7, name: "Sony A95L" }] },
        })}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: /show details for search_products/i,
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const details = screen.getByTestId("tool-call-details");
    expect(within(details).getByText(/Arguments/i)).toBeInTheDocument();
    expect(within(details).getByText(/Result/i)).toBeInTheDocument();
    // JSON pretty-print includes the keys + values verbatim.
    expect(details.textContent).toContain('"q": "monitor"');
    expect(details.textContent).toContain('"limit": 5');
    expect(details.textContent).toContain('"name": "Sony A95L"');
  });

  it("collapses again on a second click", () => {
    render(<ToolCallIndicator event={makeEvent({ status: "completed" })} />);
    const trigger = screen.getByRole("button");

    fireEvent.click(trigger);
    expect(screen.getByTestId("tool-call-details")).toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.queryByTestId("tool-call-details")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows the structured error envelope under an Error label when the tool failed", () => {
    render(
      <ToolCallIndicator
        event={makeEvent({
          status: "failed",
          args: { url: "bad" },
          errorEnvelope: { code: "invalid_url", message: "URL is not parseable" },
          result: undefined,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    const details = screen.getByTestId("tool-call-details");
    expect(within(details).getByText(/Error/i)).toBeInTheDocument();
    expect(details.textContent).toContain('"code": "invalid_url"');
    expect(details.textContent).toContain('"message": "URL is not parseable"');
    // Result label must NOT appear for failed tools.
    expect(within(details).queryByText(/^Result$/i)).not.toBeInTheDocument();
  });

  it("does not allow expansion while the tool is still running", () => {
    render(
      <ToolCallIndicator
        event={makeEvent({ status: "running", args: { q: "x" }, result: undefined })}
      />,
    );

    const trigger = screen.getByRole("status");
    expect(trigger).toBeDisabled();
    expect(trigger).not.toHaveAttribute("aria-expanded");

    fireEvent.click(trigger);
    expect(screen.queryByTestId("tool-call-details")).not.toBeInTheDocument();
  });

  it("renders a placeholder for missing args/result rather than crashing", () => {
    render(
      <ToolCallIndicator
        event={makeEvent({
          status: "completed",
          args: undefined,
          result: undefined,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    const details = screen.getByTestId("tool-call-details");
    // Two rows: Arguments (—) and Result (—).
    const placeholders = within(details).getAllByText("—");
    expect(placeholders.length).toBeGreaterThanOrEqual(2);
  });
});
