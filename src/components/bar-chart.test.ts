import { describe, expect, it } from "vitest";
import { niceTicks } from "./bar-chart";

describe("niceTicks", () => {
  it("gives whole round ticks that reach the largest value", () => {
    expect(niceTicks(10)).toEqual([0, 5, 10]);
    expect(niceTicks(9)).toEqual([0, 5, 10]);
    expect(niceTicks(3)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(1397)).toEqual([0, 500, 1000, 1500]);
    expect(niceTicks(170000)).toEqual([0, 50000, 100000, 150000, 200000]);
  });
  it("never has more than 6 ticks or a fractional step for counts", () => {
    for (const max of [1, 2, 3, 4, 7, 11, 23, 99, 101, 5000, 123456]) {
      const t = niceTicks(max);
      expect(t.length).toBeLessThanOrEqual(6);
      expect(t.at(-1)!).toBeGreaterThanOrEqual(max);
      if (max >= 4) expect(t.every((n) => Number.isInteger(n))).toBe(true);
    }
  });
});
