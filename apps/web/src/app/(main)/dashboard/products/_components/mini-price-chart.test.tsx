import { describe, expect, it } from "vitest";

import { computePriceDomain } from "./mini-price-chart";

describe("computePriceDomain", () => {
  it("pads the domain by 15% of the range so the line uses the full height", () => {
    // 100 → 125 (a 25% swing). Range is 25, padding is 3.75.
    expect(computePriceDomain([100, 125])).toEqual([96.25, 128.75]);
  });

  it("keeps the band tight instead of anchoring at 0", () => {
    const [min, max] = computePriceDomain([200, 210]);
    // The lower bound stays close to the data, not at 0 — this is the whole
    // point of the fix (a flat-looking line becomes steep).
    expect(min).toBeGreaterThan(190);
    expect(max).toBeLessThan(215);
  });

  it("uses a value-based fallback band when all prices are equal", () => {
    // Range is 0, so pad by 5% of the value (50 * 0.05 = 2.5).
    expect(computePriceDomain([50, 50, 50])).toEqual([47.5, 52.5]);
  });

  it("uses a minimum padding of 1 for very small flat prices", () => {
    // 5% of 0 would be 0; floor the padding at 1 so the domain has height.
    expect(computePriceDomain([0])).toEqual([-1, 1]);
  });

  it("returns a zero-centered band for empty input", () => {
    expect(computePriceDomain([])).toEqual([-1, 1]);
  });
});
