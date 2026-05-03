import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * persistPreference is the dispatcher that routes a preference key to the
 * right storage backend (client cookie / server cookie / localStorage).
 * The tests assert that each branch invokes only its expected backend so a
 * future config change can't silently send sidebar prefs to localStorage
 * (which would break SSR) or theme prefs to a non-existent backend.
 */

const setClientCookie = vi.hoisted(() => vi.fn());
const setLocalStorageValue = vi.hoisted(() => vi.fn());
const setValueToCookie = vi.hoisted(() => vi.fn());

vi.mock("../cookie.client", () => ({ setClientCookie }));
vi.mock("../local-storage.client", () => ({ setLocalStorageValue }));
vi.mock("@/server/server-actions", () => ({ setValueToCookie }));

import { persistPreference } from "./preferences-storage";

beforeEach(() => {
  setClientCookie.mockReset();
  setLocalStorageValue.mockReset();
  setValueToCookie.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("persistPreference", () => {
  it("routes theme_mode (client-cookie) to setClientCookie only", async () => {
    await persistPreference("theme_mode", "dark");
    expect(setClientCookie).toHaveBeenCalledWith("theme_mode", "dark");
    expect(setLocalStorageValue).not.toHaveBeenCalled();
    expect(setValueToCookie).not.toHaveBeenCalled();
  });

  it("routes sidebar_variant (client-cookie) to setClientCookie only — never localStorage (SSR-critical)", async () => {
    await persistPreference("sidebar_variant", "inset");
    expect(setClientCookie).toHaveBeenCalledWith("sidebar_variant", "inset");
    expect(setLocalStorageValue).not.toHaveBeenCalled();
  });

  it("routes sidebar_collapsible (client-cookie) to setClientCookie only", async () => {
    await persistPreference("sidebar_collapsible", "icon");
    expect(setClientCookie).toHaveBeenCalledWith("sidebar_collapsible", "icon");
    expect(setLocalStorageValue).not.toHaveBeenCalled();
  });
});
