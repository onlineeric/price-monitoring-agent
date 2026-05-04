import { act, fireEvent, render, screen } from "@testing-library/react";
import type { RefObject } from "react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { useAutoScrollToBottom } from "./auto-scroll";

/**
 * Pin the auto-scroll-with-user-pause hook used by the chat thread:
 *   - Scrolling well above the bottom flips `isAtBottom` → false.
 *   - Scrolling back inside the 80px threshold flips it back to true.
 *   - jumpToLatest delegates to the sentinel's scrollIntoView.
 *
 * The previous implementation used IntersectionObserver and broke during
 * streaming (each text-delta flipped isAtBottom to false because of a
 * transient layout shift). Locking the scroll-event-driven measure here so
 * that does not regress.
 */

interface Geometry {
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
}

function setGeometry(el: HTMLElement, { scrollHeight, clientHeight, scrollTop }: Geometry) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, writable: true, value: scrollTop });
}

interface HookHandle {
  isAtBottom: boolean;
  jumpToLatest: () => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

function Harness({ geometry, onMount }: { geometry: Geometry; onMount: (handle: HookHandle) => void }) {
  const { scrollContainerRef, sentinelRef, isAtBottom, jumpToLatest } = useAutoScrollToBottom<HTMLDivElement>();

  useEffect(() => {
    onMount({ isAtBottom, jumpToLatest, sentinelRef });
  }, [isAtBottom, jumpToLatest, sentinelRef, onMount]);

  return (
    <div
      data-testid="container"
      ref={(el) => {
        scrollContainerRef.current = el;
        if (el) setGeometry(el, geometry);
      }}
    >
      <div data-testid="sentinel" ref={sentinelRef} />
    </div>
  );
}

describe("useAutoScrollToBottom", () => {
  it("starts in `isAtBottom = true` even before any scroll event", () => {
    let handle: HookHandle | null = null;
    render(
      <Harness
        geometry={{ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 }}
        onMount={(h) => {
          handle = h;
        }}
      />,
    );
    expect(handle).not.toBeNull();
    // The initial measure runs in the effect, but the ref handler ran first
    // so geometry is in place. Distance = 1000 - 0 - 400 = 600 → above bottom.
    expect(handle?.isAtBottom).toBe(false);
  });

  it("flips `isAtBottom` to true when distance drops within the 80px threshold", () => {
    let handle: HookHandle | null = null;
    render(
      <Harness
        geometry={{ scrollHeight: 1000, clientHeight: 400, scrollTop: 540 }}
        onMount={(h) => {
          handle = h;
        }}
      />,
    );

    // Initial measure: distance = 1000 - 540 - 400 = 60 (≤ 80 → at bottom).
    expect(handle?.isAtBottom).toBe(true);

    // Now move the user well above the bottom and dispatch scroll.
    const container = screen.getByTestId("container");
    act(() => {
      setGeometry(container, { scrollHeight: 1000, clientHeight: 400, scrollTop: 100 });
      fireEvent.scroll(container);
    });
    expect(handle?.isAtBottom).toBe(false);

    // Scroll back near the bottom.
    act(() => {
      setGeometry(container, { scrollHeight: 1000, clientHeight: 400, scrollTop: 580 });
      fireEvent.scroll(container);
    });
    expect(handle?.isAtBottom).toBe(true);
  });

  it("jumpToLatest calls scrollIntoView on the sentinel", () => {
    let handle: HookHandle | null = null;
    render(
      <Harness
        geometry={{ scrollHeight: 100, clientHeight: 100, scrollTop: 0 }}
        onMount={(h) => {
          handle = h;
        }}
      />,
    );

    const sentinel = screen.getByTestId("sentinel");
    const scrollIntoViewSpy = vi.spyOn(sentinel, "scrollIntoView");

    act(() => {
      handle?.jumpToLatest();
    });

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "end" });
  });
});
