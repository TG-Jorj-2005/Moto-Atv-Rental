import { describe, expect, it } from "vitest";
import { remainingBani, toRonBani } from "./payments";

describe("toRonBani", () => {
  it("keeps RON amounts as they are", () => {
    expect(toRonBani(25000, "RON", 5)).toBe(25000);
  });
  it("converts EUR cents using the rate", () => {
    expect(toRonBani(5000, "EUR", 5)).toBe(25000); // 50 EUR -> 250 RON
    expect(toRonBani(3333, "EUR", 4.97)).toBe(Math.round(3333 * 4.97));
  });
});

describe("remainingBani", () => {
  it("subtracts payments from the total", () => {
    expect(remainingBani(40000, [10000, 5000])).toBe(25000);
  });
  it("never goes below zero", () => {
    expect(remainingBani(40000, [30000, 30000])).toBe(0);
  });
});
