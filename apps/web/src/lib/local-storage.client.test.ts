import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getLocalStorageValue, setLocalStorageValue } from "./local-storage.client";

/**
 * The localStorage helpers swallow exceptions so a quota / private-mode error
 * never crashes the app. Lock that defensive contract here.
 */

describe("client localStorage helpers", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("round-trips a value", () => {
    setLocalStorageValue("foo", "bar");
    expect(getLocalStorageValue("foo")).toBe("bar");
  });

  it("returns null when the key is missing", () => {
    expect(getLocalStorageValue("never-set")).toBeNull();
  });

  it("does NOT throw when the underlying setItem fails (private mode / quota)", () => {
    vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => setLocalStorageValue("k", "v")).not.toThrow();
  });

  it("returns null when getItem throws (locked-down browser)", () => {
    vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getLocalStorageValue("k")).toBeNull();
  });
});
