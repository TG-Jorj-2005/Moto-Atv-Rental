import { describe, expect, it } from "vitest";
import {
  COMPANY_DEFAULT_COMMISSION_BPS,
  COMPANY_MIN_COMMISSION_BPS,
  commissionBpsFor,
  commissionOf,
  isValidCompanyRate,
  OWNER_COMMISSION_BPS,
  snapshotFor,
} from "./commission";

describe("commissionBpsFor", () => {
  it("is 0% for the platform's own fleet (no owner)", () => {
    expect(commissionBpsFor(null)).toBe(0);
    expect(commissionBpsFor(undefined)).toBe(0);
  });
  it("is a fixed 15% for individual owners, whatever value is stored on the account", () => {
    expect(OWNER_COMMISSION_BPS).toBe(1500);
    expect(commissionBpsFor({ role: "OWNER", commissionBps: null })).toBe(1500);
    expect(commissionBpsFor({ role: "OWNER", commissionBps: 100 })).toBe(1500);
    expect(commissionBpsFor({ role: "OWNER", commissionBps: 9000 })).toBe(1500);
  });
  it("is the configured rate for a rental company, never below 5%", () => {
    expect(commissionBpsFor({ role: "RENTAL_COMPANY", commissionBps: 800 })).toBe(800);
    expect(commissionBpsFor({ role: "RENTAL_COMPANY", commissionBps: 500 })).toBe(500);
    expect(commissionBpsFor({ role: "RENTAL_COMPANY", commissionBps: 300 })).toBe(COMPANY_MIN_COMMISSION_BPS);
    expect(commissionBpsFor({ role: "RENTAL_COMPANY", commissionBps: 0 })).toBe(500);
    expect(commissionBpsFor({ role: "RENTAL_COMPANY", commissionBps: 99999 })).toBe(10000);
  });
  it("uses the default for a company whose rate was never set", () => {
    expect(commissionBpsFor({ role: "RENTAL_COMPANY", commissionBps: null })).toBe(COMPANY_DEFAULT_COMMISSION_BPS);
  });
});

describe("isValidCompanyRate", () => {
  it("accepts whole basis points from 5% to 100%", () => {
    for (const ok of [500, 501, 750, 1500, 10000]) expect(isValidCompanyRate(ok)).toBe(true);
    for (const bad of [499, 0, -1, 10001, 7.5, Number.NaN]) expect(isValidCompanyRate(bad)).toBe(false);
  });
});

describe("rounding is half up, in whole bani, with no floating point", () => {
  it("rounds the half case up", () => {
    expect(commissionOf(10, 500)).toBe(1); // 0.5 -> 1
    expect(commissionOf(30, 500)).toBe(2); // 1.5 -> 2
    expect(commissionOf(9, 500)).toBe(0); // 0.45 -> 0
    expect(commissionOf(11, 500)).toBe(1); // 0.55 -> 1
  });
  it("is exact on large amounts", () => {
    expect(commissionOf(123_456_789, 1500)).toBe(18_518_518); // 18,518,518.35
    expect(commissionOf(99_999_999, 1)).toBe(10_000); // 9,999.9999 -> 10,000
  });
});

describe("snapshotFor", () => {
  it("platform fleet: 0 commission and no owner share", () => {
    expect(snapshotFor(60000, null)).toEqual({ commissionBps: 0, commissionAmount: 0, ownerAmount: null });
  });
  it("owner: 15% of the amount actually charged", () => {
    expect(snapshotFor(60000, { role: "OWNER", commissionBps: null })).toEqual({ commissionBps: 1500, commissionAmount: 9000, ownerAmount: 51000 });
  });
  it("company: its own rate; the two parts always add up to the total", () => {
    for (const total of [1, 99, 33333, 40001, 897750]) {
      const s = snapshotFor(total, { role: "RENTAL_COMPANY", commissionBps: 725 });
      expect(s.commissionBps).toBe(725);
      expect(s.commissionAmount + s.ownerAmount!).toBe(total);
    }
  });
});
