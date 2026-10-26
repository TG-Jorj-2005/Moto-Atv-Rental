import { describe, expect, it } from "vitest";
import { categoriesFor, categoriesMatching, categoryFitsType, isCategory, CATEGORIES, CATEGORY_LABELS } from "./vehicle-categories";

describe("vehicle categories", () => {
  it("every category has a label and belongs to exactly one vehicle type", () => {
    for (const c of CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
      const owners = (["MOTORCYCLE", "ATV", "SCOOTER"] as const).filter((t) => categoryFitsType(c, t));
      expect(owners).toHaveLength(1);
    }
  });
  it("keeps motorcycle categories off ATVs and the other way round, and scooters have none", () => {
    expect(categoryFitsType("CRUISER", "MOTORCYCLE")).toBe(true);
    expect(categoryFitsType("CRUISER", "ATV")).toBe(false);
    expect(categoryFitsType("ATV_SPORT", "MOTORCYCLE")).toBe(false);
    expect(categoriesFor("SCOOTER")).toEqual([]);
  });
  it("recognises valid values only", () => {
    expect(isCategory("CRUISER")).toBe(true);
    expect(isCategory("cruiser")).toBe(false);
    expect(isCategory("BOAT")).toBe(false);
    expect(isCategory(undefined)).toBe(false);
  });
  it("finds categories by the words of a search, ignoring case and very short input", () => {
    expect(categoriesMatching("Cruiser")).toEqual(["CRUISER"]);
    expect(categoriesMatching("adventure")).toEqual(["ADVENTURE"]);
    expect(categoriesMatching("sport")).toEqual(["NAKED_SPORT", "DUAL_SPORT", "ATV_SPORT"]);
    expect(categoriesMatching("atv")).toEqual(["ATV_SPORT", "ATV_UTILITY"]);
    expect(categoriesMatching("cr")).toEqual([]);
    expect(categoriesMatching("grizzly")).toEqual([]);
  });
});

describe("categoriesForFilter", () => {
  it("offers every category without a type filter and only the matching ones with it", async () => {
    const { categoriesForFilter, CATEGORIES, categoryFitsType } = await import("./vehicle-categories");
    expect(categoriesForFilter(null)).toEqual(CATEGORIES);
    expect(categoriesForFilter("ATV")).toEqual(["ATV_SPORT", "ATV_UTILITY"]);
    expect(categoriesForFilter("MOTORCYCLE").every((c) => categoryFitsType(c, "MOTORCYCLE"))).toBe(true);
    expect(categoriesForFilter("MOTORCYCLE")).not.toContain("ATV_SPORT");
    expect(categoriesForFilter("SCOOTER")).toEqual([]);
  });
});
