import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useIsMobile } from "./use-mobile";

/**
 * useIsMobile is the breakpoint hook the sidebar and other layout pieces
 * use to decide between desktop / mobile chrome. It must default to `false`
 * (desktop) on first paint to keep SSR / client agreement until the effect
 * runs, and then track window.innerWidth past the 768px threshold.
 */

describe("useIsMobile", () => {
  const originalInnerWidth = window.innerWidth;

  function setWidth(value: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value });
  }

  beforeEach(() => {
    setWidth(originalInnerWidth);
    // Re-install the matchMedia mock per test — the global setup's
    // `vi.restoreAllMocks()` afterEach hook can clear the mock implementation
    // assigned in the very first run, leaving subsequent renders with a stub
    // that lacks `addEventListener`.
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: window.innerWidth < 768,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    setWidth(originalInnerWidth);
  });

  it("returns false (desktop) when innerWidth is wide", () => {
    setWidth(1280);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when innerWidth crosses below the 768px breakpoint", () => {
    setWidth(500);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("treats exactly 768px as desktop (the breakpoint is exclusive)", () => {
    setWidth(768);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });
});
