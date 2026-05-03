import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, "PointerEvent", {
  writable: true,
  value: MouseEvent,
});

Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
  writable: true,
  value: vi.fn(),
});

class ResizeObserverMock {
  observe() {
    // No-op for jsdom.
  }

  unobserve() {
    // No-op for jsdom.
  }

  disconnect() {
    // No-op for jsdom.
  }
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});

class IntersectionObserverMock {
  observe() {
    // No-op for jsdom; tests inspect store/UI state, not real intersection.
  }

  unobserve() {
    // No-op.
  }

  disconnect() {
    // No-op.
  }

  takeRecords() {
    return [];
  }
}

Object.defineProperty(window, "IntersectionObserver", {
  writable: true,
  value: IntersectionObserverMock,
});
