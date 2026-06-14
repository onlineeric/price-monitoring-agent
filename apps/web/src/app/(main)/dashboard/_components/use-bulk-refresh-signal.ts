"use client";

import { useCallback, useEffect, useRef } from "react";

import { useRouter } from "next/navigation";

import { toast } from "sonner";

/** How often to poll the completion marker while a batch is in flight. */
const POLL_INTERVAL_MS = 4_000;
/** Give up watching after this long so polling can never run unbounded. */
const MAX_WATCH_MS = 10 * 60 * 1_000;

/** Read the worker's "last bulk refresh completed" marker; null on any error. */
async function fetchCompletionMarker(): Promise<string | null> {
  try {
    const response = await fetch("/api/digest/status");
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data.lastCompletedAt === "string" ? data.lastCompletedAt : null;
  } catch {
    return null;
  }
}

/**
 * Watches for a bulk "Check All" batch to finish, then surfaces a *user-clickable*
 * "refresh available" signal instead of auto-refreshing the list (B1).
 *
 * How it works: when a batch is triggered, the caller invokes `watchForCompletion()`.
 * We capture the current completion marker as a baseline, then poll the status
 * endpoint. The worker advances the marker (a server-side timestamp) when the
 * whole batch finishes; once the polled value differs from the baseline we show
 * a toast with a "Refresh" action and stop polling. Comparing marker-to-marker
 * (both server-sourced) sidesteps any client/server clock skew.
 */
export function useBulkRefreshSignal() {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Never leave a poll running after the component unmounts.
  useEffect(() => stop, [stop]);

  const watchForCompletion = useCallback(async () => {
    stop(); // cancel any prior watch (e.g. a rapid re-trigger)

    const baseline = await fetchCompletionMarker();
    const startedAt = Date.now();

    timerRef.current = setInterval(async () => {
      if (Date.now() - startedAt > MAX_WATCH_MS) {
        stop();
        return;
      }

      const current = await fetchCompletionMarker();
      if (current !== null && current !== baseline) {
        stop();
        toast.success("Product info refreshed", {
          description: "All products have been updated — refresh to see the latest.",
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: "Refresh",
            onClick: () => router.refresh(),
          },
        });
      }
    }, POLL_INTERVAL_MS);
  }, [router, stop]);

  return { watchForCompletion };
}
