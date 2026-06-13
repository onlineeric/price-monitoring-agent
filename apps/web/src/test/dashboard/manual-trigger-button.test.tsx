import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ManualTriggerButton } from "@/app/(main)/dashboard/_components/manual-trigger-button";

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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ mode: "price" });
  });

  it("posts mode: info when the info+price option is selected", async () => {
    const fetchMock = mockFetchOk();
    const user = userEvent.setup();
    render(<ManualTriggerButton />);
    await openDialog(user);

    await user.click(screen.getByRole("radio", { name: /info \+ price/i }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/digest/trigger");
    expect(JSON.parse(init.body)).toEqual({ mode: "info" });
  });
});
