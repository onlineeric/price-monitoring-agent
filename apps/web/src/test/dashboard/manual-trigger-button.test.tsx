import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ManualTriggerButton } from "@/app/(main)/dashboard/_components/manual-trigger-button";

// The bulk-refresh-signal hook (used by the button) needs a router + toast.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function mockFetchOk() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ success: true, jobId: "job_1" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The POST the button makes to kick off the digest (ignores the status poll). */
function triggerCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find(([url]) => url === "/api/digest/trigger");
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /check all & send email/i }));
  await screen.findByRole("alertdialog");
}

describe("ManualTriggerButton — refresh mode", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the two-option control without the old 'under construction' toggle", async () => {
    const user = userEvent.setup();
    render(<ManualTriggerButton />);
    await openDialog(user);

    expect(screen.getByRole("radio", { name: /Refresh all products' price/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /info \+ price/i })).toBeInTheDocument();
    expect(screen.queryByText(/Feature under construction/i)).toBeNull();
    expect(screen.queryByText(/Force AI Extraction/i)).toBeNull();
  });

  it("posts mode: price by default", async () => {
    const fetchMock = mockFetchOk();
    const user = userEvent.setup();
    render(<ManualTriggerButton />);
    await openDialog(user);

    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(triggerCall(fetchMock)).toBeDefined());
    const [, init] = triggerCall(fetchMock) as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ mode: "price" });
  });

  it("posts mode: info when the info+price option is selected", async () => {
    const fetchMock = mockFetchOk();
    const user = userEvent.setup();
    render(<ManualTriggerButton />);
    await openDialog(user);

    await user.click(screen.getByRole("radio", { name: /info \+ price/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(triggerCall(fetchMock)).toBeDefined());
    const [, init] = triggerCall(fetchMock) as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ mode: "info" });
  });

  it("resets back to the price default after the dialog is closed and reopened", async () => {
    mockFetchOk();
    const user = userEvent.setup();
    render(<ManualTriggerButton />);

    // Select the expensive "info + price" option, then cancel (close) the dialog.
    await openDialog(user);
    await user.click(screen.getByRole("radio", { name: /info \+ price/i }));
    expect(screen.getByRole("radio", { name: /info \+ price/i })).toBeChecked();
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // Reopen: the choice must default back to price, not stay on info, so an
    // expensive AI batch can't be triggered by accident.
    await openDialog(user);
    expect(screen.getByRole("radio", { name: /Refresh all products' price/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /info \+ price/i })).not.toBeChecked();
  });
});
