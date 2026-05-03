import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { deleteClientCookie, getClientCookie, setClientCookie } from "./cookie.client";

/**
 * The cookie helpers are the only API the preferences storage layer uses to
 * persist UI state across reloads. jsdom backs `document.cookie`, so we can
 * round-trip values end-to-end here.
 */

describe("client cookie helpers", () => {
  beforeEach(() => {
    // Wipe any cookies from a prior test by parsing them out.
    for (const cookie of document.cookie.split(";")) {
      const eq = cookie.indexOf("=");
      const name = (eq > -1 ? cookie.slice(0, eq) : cookie).trim();
      if (name) deleteClientCookie(name);
    }
  });

  afterEach(() => {
    for (const cookie of document.cookie.split(";")) {
      const eq = cookie.indexOf("=");
      const name = (eq > -1 ? cookie.slice(0, eq) : cookie).trim();
      if (name) deleteClientCookie(name);
    }
  });

  it("round-trips a value via setClientCookie + getClientCookie", () => {
    setClientCookie("theme", "dark");
    expect(getClientCookie("theme")).toBe("dark");
  });

  it("returns undefined for cookies that were never set", () => {
    expect(getClientCookie("never-set")).toBeUndefined();
  });

  it("deleteClientCookie removes a previously set cookie", () => {
    setClientCookie("layout", "centered");
    deleteClientCookie("layout");
    expect(getClientCookie("layout")).toBeUndefined();
  });
});
