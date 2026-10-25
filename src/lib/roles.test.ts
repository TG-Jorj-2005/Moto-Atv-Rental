import { describe, expect, it } from "vitest";
import { canListVehicles, canRent, canRequestQuotes, homePathFor, isDemotion, REGISTERABLE_ROLES, ROLE_RANK } from "./roles";
import { registerSchema } from "./forms";

describe("role hierarchy", () => {
  it("orders CUSTOMER < OWNER < RENTAL_COMPANY < ADMIN", () => {
    expect(ROLE_RANK.CUSTOMER).toBeLessThan(ROLE_RANK.OWNER);
    expect(ROLE_RANK.OWNER).toBeLessThan(ROLE_RANK.RENTAL_COMPANY);
    expect(ROLE_RANK.RENTAL_COMPANY).toBeLessThan(ROLE_RANK.ADMIN);
  });
  it("tells promotions from demotions", () => {
    expect(isDemotion("ADMIN", "CUSTOMER")).toBe(true);
    expect(isDemotion("RENTAL_COMPANY", "OWNER")).toBe(true);
    expect(isDemotion("CUSTOMER", "OWNER")).toBe(false);
    expect(isDemotion("OWNER", "OWNER")).toBe(false);
  });
});

describe("capabilities per role", () => {
  it("only owners and rental companies list vehicles", () => {
    expect(["CUSTOMER", "OWNER", "RENTAL_COMPANY", "ADMIN"].map((r) => canListVehicles(r as never))).toEqual([false, true, true, false]);
  });
  it("only rental companies request bulk quotes", () => {
    expect(["CUSTOMER", "OWNER", "RENTAL_COMPANY", "ADMIN"].map((r) => canRequestQuotes(r as never))).toEqual([false, false, true, false]);
  });
  it("everyone but the admin rents", () => {
    expect(["CUSTOMER", "OWNER", "RENTAL_COMPANY", "ADMIN"].map((r) => canRent(r as never))).toEqual([true, true, true, false]);
  });
  it("sends each role to its home page", () => {
    expect(homePathFor("CUSTOMER")).toBe("/");
    expect(homePathFor("OWNER")).toBe("/owner");
    expect(homePathFor("RENTAL_COMPANY")).toBe("/quotes");
    expect(homePathFor("ADMIN")).toBe("/admin");
  });
});

describe("registration", () => {
  const base = { name: "Ana Pop", email: "ana@example.com", password: "long-enough-1" };
  it("offers exactly the three self-service roles", () => {
    expect([...REGISTERABLE_ROLES]).toEqual(["CUSTOMER", "OWNER", "RENTAL_COMPANY"]);
  });
  it("accepts each self-service role", () => {
    for (const role of REGISTERABLE_ROLES) expect(registerSchema.safeParse({ ...base, role }).success).toBe(true);
  });
  it("never lets a visitor register as ADMIN or with an unknown role", () => {
    expect(registerSchema.safeParse({ ...base, role: "ADMIN" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, role: "USER" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base }).success).toBe(false);
  });
});
