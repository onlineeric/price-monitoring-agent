import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useUpdateInfo drives the per-product "Update product info" button. Since the
 * route now waits for the worker, the hook branches on the response `status`:
 *   - completed  → success toast + router.refresh()
 *   - processing → info toast, NO refresh (data not ready yet)
 *   - failed     → error toast, NO refresh
 *   - network    → error toast, NO refresh
 * The router and toast are mocked at the module boundary; fetch is stubbed.
 */

const routerMock = vi.hoisted(() => ({ refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { useUpdateInfo } from "@/app/(main)/dashboard/products/_components/use-update-info";

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";

function stubFetch(response: { ok: boolean; status: number; body: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  routerMock.refresh.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  toastMock.info.mockReset();
  vi.unstubAllGlobals();
});

describe("useUpdateInfo", () => {
  it("POSTs to the update-info route and tracks the updating id while pending", async () => {
    const fetchMock = stubFetch({ ok: true, status: 200, body: { success: true, status: "completed" } });
    const { result } = renderHook(() => useUpdateInfo());

    await act(async () => {
      await result.current.handleUpdateInfo(PRODUCT_ID);
    });

    expect(fetchMock).toHaveBeenCalledWith(`/api/products/${PRODUCT_ID}/update-info`, { method: "POST" });
    // Cleared in finally once the request resolves.
    expect(result.current.updatingInfoId).toBeNull();
  });

  it("on 'completed' shows a success toast and refreshes the route", async () => {
    stubFetch({ ok: true, status: 200, body: { success: true, status: "completed" } });
    const { result } = renderHook(() => useUpdateInfo());

    await act(async () => {
      await result.current.handleUpdateInfo(PRODUCT_ID);
    });

    expect(toastMock.success).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalledTimes(1));
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("on 'processing' (timeout) shows an info toast and does NOT refresh", async () => {
    stubFetch({ ok: true, status: 202, body: { success: true, status: "processing" } });
    const { result } = renderHook(() => useUpdateInfo());

    await act(async () => {
      await result.current.handleUpdateInfo(PRODUCT_ID);
    });

    expect(toastMock.info).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("on a 422 failure shows the worker's error and does NOT refresh", async () => {
    stubFetch({ ok: false, status: 422, body: { success: false, status: "failed", error: "Page unreachable" } });
    const { result } = renderHook(() => useUpdateInfo());

    await act(async () => {
      await result.current.handleUpdateInfo(PRODUCT_ID);
    });

    expect(toastMock.error).toHaveBeenCalledWith(
      "Failed to update product info",
      expect.objectContaining({ description: "Page unreachable" }),
    );
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });

  it("on a network error shows a generic error toast", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useUpdateInfo());

    await act(async () => {
      await result.current.handleUpdateInfo(PRODUCT_ID);
    });

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
