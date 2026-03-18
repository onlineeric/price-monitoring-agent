import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ManualReportPageClient } from "@/app/(main)/dashboard/send-report/_components/manual-report-page-client";

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

const previewResponse = {
  preview: {
    previewId: "preview_1",
    generatedAt: "2026-03-17T08:00:00.000Z",
    subject: "Price Monitor Report - March 17, 2026",
    html: "<p>Reviewed HTML Preview</p>",
    productCount: 1,
    items: [
      {
        productId: "p1",
        name: "Example Product",
        url: "https://example.com",
        imageUrl: null,
        currentPrice: 12345,
        currency: "USD",
        lastChecked: "2026-03-17T08:00:00.000Z",
        lastFailed: null,
        vsLastCheck: null,
        vs7dAvg: null,
        vs30dAvg: null,
        vs90dAvg: null,
        vs180dAvg: null,
      },
    ],
  },
  availability: {
    canSend: true,
    rollingWindowUsed: 0,
    rollingWindowLimit: 3,
    dailyRecipientsUsed: 0,
    dailyRecipientsLimit: 99,
    blockedUntil: null,
    reason: "none",
  },
};

describe("ManualReportPageClient", () => {
  it("renders reviewed HTML preview and sends with previewId + recipients", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => previewResponse,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          recipientCount: 1,
          generatedAt: previewResponse.preview.generatedAt,
          availability: previewResponse.availability,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ManualReportPageClient />);

    const iframe = await screen.findByTitle("Manual report preview");
    expect(iframe).toHaveAttribute("srcdoc", expect.stringContaining("Reviewed HTML Preview"));

    await user.type(screen.getByLabelText("Recipients"), "one@example.com");
    await user.click(screen.getByRole("button", { name: "Send Report" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    expect(fetchMock).toHaveBeenLastCalledWith("/api/manual-report/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        previewId: "preview_1",
        recipients: ["one@example.com"],
      }),
    });
    expect(toastSuccess).toHaveBeenCalled();
  });

  it("blocks duplicate recipients before send request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => previewResponse,
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<ManualReportPageClient />);

    await screen.findByTitle("Manual report preview");
    await user.type(screen.getByLabelText("Recipients"), "one@example.com, one@example.com");
    await user.click(screen.getByRole("button", { name: "Send Report" }));

    expect(await screen.findByText("Duplicate recipient email addresses are not allowed.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps preview and recipient input on send failure so user can retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => previewResponse,
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: {
            code: "provider_send_failed",
            message: "Provider timeout",
          },
          availability: previewResponse.availability,
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ManualReportPageClient />);

    const recipientField = await screen.findByLabelText("Recipients");
    await user.type(recipientField, "retry@example.com");
    await user.click(screen.getByRole("button", { name: "Send Report" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });

    expect(screen.getByTitle("Manual report preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Reviewed HTML Preview"),
    );
    expect(screen.getByLabelText("Recipients")).toHaveValue("retry@example.com");
  });
});
