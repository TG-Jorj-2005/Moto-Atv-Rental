import { describe, expect, it } from "vitest";
import type { RideDnaAnswers } from "./answers";
import { ADVENTURE_FIT, CATEGORY_TRAITS, WEIGHTS, compareRanked, eligibilityReasons, evaluateVehicle, powerLevel, scoreLabel, type VehicleFacts } from "./scoring";
import { CATEGORIES } from "@/lib/vehicle-categories";

const answers = (over: Partial<RideDnaAnswers> = {}): RideDnaAnswers => ({ experience: "INTERMEDIATE", licence: "A", adventure: "ROAD_TOURING", priorities: ["COMFORT"], budgetRon: 2000, duration: "WEEKEND", start: null, passengers: 1, ...over });
const bike = (over: Partial<VehicleFacts> = {}): VehicleFacts => ({ id: "v1", name: "Test bike", type: "MOTORCYCLE", category: "ADVENTURE", powerHp: 73, engineCc: 689, seats: 2, licenseCategory: "A", ...over });
const PRICE = 100_000; // 1000 RON

describe("weights and tables", () => {
  it("the weights add up to 100", () => {
    expect(Object.values(WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("every category is described for every adventure and every style, with values between 0 and 1", () => {
    for (const c of CATEGORIES) {
      for (const v of Object.values(ADVENTURE_FIT[c])) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
      for (const v of Object.values(CATEGORY_TRAITS[c])) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    }
  });
  it("every adventure has at least one category that suits it", () => {
    for (const adv of ["ROAD_TOURING", "MIXED_TRAILS", "OFFROAD_TRAILS", "ATV_RECREATION"] as const) expect(CATEGORIES.some((c) => ADVENTURE_FIT[c][adv] > 0)).toBe(true);
  });
  it("power levels have their boundaries", () => {
    expect([50, 51, 100, 101].map(powerLevel)).toEqual(["LOW", "MEDIUM", "MEDIUM", "HIGH"]);
  });
});

describe("eligibility", () => {
  it("a fitting vehicle has no failed rule", () => {
    expect(eligibilityReasons(answers(), bike(), PRICE)).toEqual([]);
  });
  it("a category not intended for the ride is excluded, whatever its score would be", () => {
    expect(eligibilityReasons(answers({ adventure: "OFFROAD_TRAILS" }), bike({ category: "CRUISER" }), PRICE)).toContain("NOT_FOR_ADVENTURE");
    expect(eligibilityReasons(answers({ adventure: "ROAD_TOURING" }), bike({ type: "ATV", category: "ATV_UTILITY", licenseCategory: null }), PRICE)).toContain("NOT_FOR_ADVENTURE");
    expect(evaluateVehicle(answers({ adventure: "OFFROAD_TRAILS" }), bike({ category: "CRUISER" }), PRICE).score).toBeNull();
  });
  it("a vehicle without a category is never recommended", () => {
    expect(eligibilityReasons(answers(), bike({ category: null }), PRICE)).toContain("NO_CATEGORY");
  });
  it("licence: none excludes motorcycles but not ATVs; A2 excludes A-only bikes and unrecorded ones; A covers an unrecorded one", () => {
    expect(eligibilityReasons(answers({ licence: "NONE" }), bike(), PRICE)).toContain("LICENCE_REQUIRED");
    expect(eligibilityReasons(answers({ licence: "NONE", adventure: "ATV_RECREATION" }), bike({ type: "ATV", category: "ATV_UTILITY", licenseCategory: null }), PRICE)).toEqual([]);
    expect(eligibilityReasons(answers({ licence: "A2" }), bike({ licenseCategory: "A" }), PRICE)).toContain("LICENCE_TOO_LOW");
    expect(eligibilityReasons(answers({ licence: "A2" }), bike({ licenseCategory: "A2" }), PRICE)).toEqual([]);
    expect(eligibilityReasons(answers({ licence: "A2" }), bike({ licenseCategory: null }), PRICE)).toContain("LICENCE_UNKNOWN");
    expect(eligibilityReasons(answers({ licence: "A" }), bike({ licenseCategory: null }), PRICE)).toEqual([]);
    expect(eligibilityReasons(answers({ licence: "A2" }), bike({ licenseCategory: "B" }), PRICE)).toContain("LICENCE_UNKNOWN");
  });
  it("experience: a beginner gets no high-power or unknown-power bike, an intermediate none above 130 hp, an advanced rider any", () => {
    expect(eligibilityReasons(answers({ experience: "BEGINNER" }), bike({ powerHp: 101 }), PRICE)).toContain("TOO_POWERFUL");
    expect(eligibilityReasons(answers({ experience: "BEGINNER" }), bike({ powerHp: 100 }), PRICE)).toEqual([]);
    expect(eligibilityReasons(answers({ experience: "BEGINNER" }), bike({ powerHp: null }), PRICE)).toContain("POWER_UNKNOWN");
    expect(eligibilityReasons(answers({ experience: "INTERMEDIATE" }), bike({ powerHp: 131 }), PRICE)).toContain("TOO_POWERFUL");
    expect(eligibilityReasons(answers({ experience: "INTERMEDIATE" }), bike({ powerHp: 130 }), PRICE)).toEqual([]);
    expect(eligibilityReasons(answers({ experience: "ADVANCED" }), bike({ powerHp: 200 }), PRICE)).toEqual([]);
  });
  it("a passenger needs a recorded seat for two", () => {
    expect(eligibilityReasons(answers({ passengers: 2 }), bike({ seats: 1 }), PRICE)).toContain("SEATS");
    expect(eligibilityReasons(answers({ passengers: 2 }), bike({ seats: null }), PRICE)).toContain("SEATS");
    expect(eligibilityReasons(answers({ passengers: 2 }), bike({ seats: 2 }), PRICE)).toEqual([]);
    expect(eligibilityReasons(answers({ passengers: 1 }), bike({ seats: null }), PRICE)).toEqual([]);
  });
  it("the budget is a hard limit, to the bani", () => {
    expect(eligibilityReasons(answers({ budgetRon: 1000 }), bike(), 100_000)).toEqual([]);
    expect(eligibilityReasons(answers({ budgetRon: 1000 }), bike(), 100_001)).toContain("OVER_BUDGET");
    expect(eligibilityReasons(answers({ budgetRon: 50 }), bike(), PRICE)).toContain("OVER_BUDGET");
  });
  it("lists every failed rule, not only the first", () => {
    const reasons = eligibilityReasons(answers({ licence: "NONE", budgetRon: 50, passengers: 2 }), bike({ seats: 1 }), PRICE);
    expect(reasons).toEqual(expect.arrayContaining(["LICENCE_REQUIRED", "SEATS", "OVER_BUDGET"]));
  });
});

describe("score", () => {
  it("is a whole number from 0 to 100 and is the same on every run", () => {
    const a = evaluateVehicle(answers(), bike(), PRICE);
    const b = evaluateVehicle(answers(), bike(), PRICE);
    expect(a).toEqual(b);
    expect(Number.isInteger(a.score)).toBe(true);
    expect(a.score).toBeGreaterThanOrEqual(0);
    expect(a.score).toBeLessThanOrEqual(100);
  });
  it("a sport rider on a naked sport bike gets the weighted sum of the documented fits", () => {
    // adventure 1, comfort of ADVENTURE 0.8 is not 1: use a SPORT rider on a naked sport bike instead
    const a = answers({ experience: "ADVANCED", adventure: "ROAD_TOURING", priorities: ["SPORT"], budgetRon: 10_000 });
    const v = bike({ category: "NAKED_SPORT", powerHp: 124 });
    const ev = evaluateVehicle(a, v, 100_000);
    // adventure 0.8, sport 1, experience 1 (advanced + high), budget 1
    expect(ev.score).toBe(Math.round((40 * 0.8 + 30 * 1 + 15 * 1 + 15 * 1) / 100 * 100));
  });
  it("follows the documented weights", () => {
    const a = answers({ experience: "ADVANCED", adventure: "MIXED_TRAILS", priorities: ["EXPLORATION"], budgetRon: 2000 });
    const v = bike({ category: "ADVENTURE", powerHp: 102 });
    // adventure 1.0, exploration 1.0, advanced+high 1.0, budget ratio 0.5 -> 1.0
    expect(evaluateVehicle(a, v, 100_000).score).toBe(100);
    // budget ratio 1.0 -> budget fit 0.4: 85 + 15 * 0.4 = 91
    expect(evaluateVehicle(answers({ ...a, budgetRon: 1000 }), v, 100_000).score).toBe(91);
  });
  it("rescales instead of rewarding missing data, and reports the gap", () => {
    const a = answers({ experience: "ADVANCED", adventure: "MIXED_TRAILS", priorities: ["POWER"], budgetRon: 2000 });
    const withHp = evaluateVehicle(a, bike({ powerHp: 60 }), 100_000);
    const noHp = evaluateVehicle(a, bike({ powerHp: null }), 100_000);
    expect(noHp.eligible).toBe(true);
    expect(noHp.dataGaps).toContain("Power not recorded");
    expect(noHp.criteria.find((c) => c.key === "preferences")!.fit).toBeNull();
    expect(noHp.criteria.find((c) => c.key === "experience")!.fit).toBeNull();
    // adventure 1 and budget 1 are all that can be judged: 100, not more than a vehicle that was judged on everything
    expect(noHp.score).toBe(100);
    expect(withHp.score!).toBeLessThan(noHp.score!);
    expect(noHp.explanations.join(" ")).not.toMatch(/hp/);
  });
  it("explanations only mention data that is stored", () => {
    const ev = evaluateVehicle(answers({ passengers: 2 }), bike({ seats: 2, licenseCategory: "A" }), PRICE);
    expect(ev.explanations.some((e) => e.includes("73 hp"))).toBe(true);
    expect(ev.explanations.some((e) => e.includes("licence A"))).toBe(true);
    expect(ev.explanations.some((e) => e.includes("2 seats"))).toBe(true);
    const none = evaluateVehicle(answers(), bike({ licenseCategory: null, seats: null }), PRICE);
    expect(none.explanations.some((e) => /licence|seats/i.test(e))).toBe(false);
  });
  it("labels use the documented intervals", () => {
    expect([100, 85, 84, 70, 69, 50, 49, 0].map(scoreLabel)).toEqual(["Excellent match", "Excellent match", "Good match", "Good match", "Fair match", "Fair match", "Possible match", "Possible match"]);
  });
  it("a cheaper vehicle scores at least as high as a dearer one on the budget criterion", () => {
    const cheap = evaluateVehicle(answers(), bike(), 50_000).score!;
    const dear = evaluateVehicle(answers(), bike(), 190_000).score!;
    expect(cheap).toBeGreaterThan(dear);
  });
});

describe("ranking order", () => {
  const r = (id: string, score: number, priceBani: number, name = id) => ({ id, score, priceBani, name });
  it("higher score first, then the lower price, then the name, then the id", () => {
    const list = [r("c", 80, 500), r("a", 90, 900), r("b", 90, 700), r("e", 80, 500, "Alpha"), r("d", 80, 500, "Alpha")];
    expect(list.sort(compareRanked).map((x) => x.id)).toEqual(["b", "a", "d", "e", "c"]);
  });
  it("is the same whatever the input order", () => {
    const list = [r("a", 70, 1), r("b", 70, 1), r("c", 70, 1), r("d", 70, 1)];
    const forward = [...list].sort(compareRanked).map((x) => x.id);
    const backward = [...list].reverse().sort(compareRanked).map((x) => x.id);
    expect(forward).toEqual(backward);
  });
});
