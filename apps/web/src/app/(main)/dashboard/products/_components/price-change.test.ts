import { describe, expect, it } from "vitest";

import { calculatePriceChange } from "./price-change";

const at = (price: number) => ({ date: new Date(), price });

describe("calculatePriceChange", () => {
  it("returns null with fewer than two points", () => {
    expect(calculatePriceChange([])).toBeNull();
    expect(calculatePriceChange([at(100)])).toBeNull();
  });

  it("computes the percentage change from oldest to newest", () => {
    expect(calculatePriceChange([at(100), at(150)])).toBe(50);
    expect(calculatePriceChange([at(200), at(150)])).toBeCloseTo(-25);
  });

  it("uses only the first and last points", () => {
    expect(calculatePriceChange([at(100), at(999), at(200)])).toBe(100);
  });

  it("returns null when the oldest price is 0 (avoids divide-by-zero)", () => {
    expect(calculatePriceChange([at(0), at(100)])).toBeNull();
  });
});
