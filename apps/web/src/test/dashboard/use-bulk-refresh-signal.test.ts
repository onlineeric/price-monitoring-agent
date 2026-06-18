import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useBulkRefreshSignal polls the digest-status marker after a Check-All batch
 * is triggered and, once the marker advances past the baseline it captured,
 * surfaces a "Refresh" toast (user-clicked → router.refresh()). It must never
 * auto-refresh and must stop polling once it has signalled.
 */

const routerMock = vi.hoisted(() => ({ refresh: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { useBulkRefreshSignal } from "@/app/(main)/dashboard/_components/use-bulk-refresh-signal";

const POLL_INTERVAL_MS = 4_000; // mirrors the hook's constant

function markerResponse(lastCompletedAt: string | null) {
  return { ok: true, status: 200, json: async () => ({ success: true, lastCompletedAt }) };
}

beforeEach(() => {
  vi.useFakeTimers();
  routerMock.refresh.mockReset();
  toastMock.success.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useBulkRefreshSignal", () => {
  it("signals (and stops) once the marker advances past the baseline", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(markerResponse("T0")) // baseline
      .mockResolvedValueOnce(markerResponse("T0")) // tick 1 — unchanged
      .mockResolvedValueOnce(markerResponse("T1")); // tick 2 — changed
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBulkRefreshSignal());

    await act(async () => {
      await result.current.watchForCompletion();
    });

    // Tick 1: marker unchanged → no signal yet.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(toastMock.success).not.toHaveBeenCalled();

    // Tick 2: marker advanced → "Refresh" toast appears.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(toastMock.success).toHaveBeenCalledTimes(1);

    // The toast offers a Refresh action; clicking it refreshes the route.
    const [, options] = toastMock.success.mock.calls[0];
    expect(routerMock.refresh).not.toHaveBeenCalled();
    options.action.onClick();
    expect(routerMock.refresh).toHaveBeenCalledTimes(1);

    // Polling stopped after signalling: no further fetches, no duplicate toast.
    const callsAfterSignal = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });
    expect(fetchMock.mock.calls.length).toBe(callsAfterSignal);
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it("returns a stop handle that cancels polling (used when the trigger fails)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(markerResponse("T0")) // baseline
      .mockResolvedValue(markerResponse("T1")); // would otherwise signal on tick 1
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBulkRefreshSignal());

    let stop: (() => void) | undefined;
    await act(async () => {
      stop = await result.current.watchForCompletion();
    });

    // Caller cancels the watch (e.g. the trigger POST failed).
    act(() => stop?.());

    const callsAfterStop = fetchMock.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });

    // No further polling and no toast after stop.
    expect(fetchMock.mock.calls.length).toBe(callsAfterStop);
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("does not signal prematurely when the baseline read fails (establishes baseline late)", async () => {
    // Baseline fetch errors (HTTP 500) → indeterminate. A stale marker already
    // exists from a prior run ("T0"); the batch has NOT finished yet. We must
    // NOT fire on first seeing "T0" — it becomes the late baseline instead.
    const errorResponse = { ok: false, status: 500, json: async () => ({}) };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse) // baseline read fails
      .mockResolvedValueOnce(markerResponse("T0")) // tick 1 — establishes baseline, no signal
      .mockResolvedValueOnce(markerResponse("T0")) // tick 2 — unchanged
      .mockResolvedValue(markerResponse("T1")); // tick 3 — genuinely advanced
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBulkRefreshSignal());
    await act(async () => {
      await result.current.watchForCompletion();
    });

    // Ticks 1 & 2: baseline (re)established at "T0", no premature signal.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    });
    expect(toastMock.success).not.toHaveBeenCalled();

    // Tick 3: marker advances past the late baseline → signal fires once.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(toastMock.success).toHaveBeenCalledTimes(1);
  });

  it("does not signal while the marker stays at the baseline", async () => {
    const fetchMock = vi.fn().mockResolvedValue(markerResponse("T0"));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useBulkRefreshSignal());
    await act(async () => {
      await result.current.watchForCompletion();
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    });

    expect(toastMock.success).not.toHaveBeenCalled();
    expect(routerMock.refresh).not.toHaveBeenCalled();
  });
});
