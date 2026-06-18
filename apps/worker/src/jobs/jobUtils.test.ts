import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * jobUtils holds the small resolution helpers shared by priceCheck and
 * updateProductInfo. The database module is mocked at its boundary because we
 * are testing the URL-resolution branching, not Postgres.
 */
const dbMocks = vi.hoisted(() => ({
  getProductById: vi.fn(),
}));

vi.mock("../services/database.js", () => dbMocks);

import { formatErrorMessage, resolveTargetUrl } from "./jobUtils";

beforeEach(() => {
  dbMocks.getProductById.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatErrorMessage", () => {
  it("returns the message from an Error instance", () => {
    expect(formatErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back to a generic message for non-Error values", () => {
    expect(formatErrorMessage("oops")).toBe("Unknown error");
    expect(formatErrorMessage(undefined)).toBe("Unknown error");
  });
});

describe("resolveTargetUrl", () => {
  it("prefers the URL when provided (no DB lookup)", async () => {
    const url = await resolveTargetUrl("https://shop/x", "prod-1", "job-1");
    expect(url).toBe("https://shop/x");
    expect(dbMocks.getProductById).not.toHaveBeenCalled();
  });

  it("falls back to a productId lookup (legacy mode)", async () => {
    dbMocks.getProductById.mockResolvedValueOnce({ id: "prod-2", url: "https://shop/y" });
    const url = await resolveTargetUrl(undefined, "prod-2", "job-1");
    expect(url).toBe("https://shop/y");
    expect(dbMocks.getProductById).toHaveBeenCalledWith("prod-2");
  });

  it("returns null when neither a URL nor a resolvable productId is given", async () => {
    expect(await resolveTargetUrl(undefined, undefined, "job-1")).toBeNull();

    dbMocks.getProductById.mockResolvedValueOnce(null);
    expect(await resolveTargetUrl(undefined, "missing", "job-1")).toBeNull();
  });
});
