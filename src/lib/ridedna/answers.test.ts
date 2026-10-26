import { describe, expect, it } from "vitest";
import { answersToQuery, parseAnswers, type RideDnaAnswers } from "./answers";

const valid = { exp: "INTERMEDIATE", lic: "A2", adv: "MIXED_TRAILS", pri: "EXPLORATION,COMFORT", bud: "1500", dur: "WEEKEND", pax: "1", ack: "1" };

describe("parseAnswers", () => {
  it("accepts a complete set of answers", () => {
    const r = parseAnswers(valid);
    expect(r).toEqual({ ok: true, answers: { experience: "INTERMEDIATE", licence: "A2", adventure: "MIXED_TRAILS", priorities: ["EXPLORATION", "COMFORT"], budgetRon: 1500, duration: "WEEKEND", start: null, passengers: 1 } });
  });
  it("round-trips through the query string", () => {
    const a: RideDnaAnswers = { experience: "ADVANCED", licence: "A", adventure: "ROAD_TOURING", priorities: ["SPORT"], budgetRon: 900, duration: "WEEK", start: { year: 2027, month: 5, day: 8 }, passengers: 2 };
    expect(parseAnswers(Object.fromEntries(answersToQuery(a)))).toEqual({ ok: true, answers: a });
  });
  it("reports every missing or invalid question and never throws", () => {
    const r = parseAnswers({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.sort()).toEqual(["ack", "adv", "bud", "dur", "exp", "lic", "pax", "pri"].sort());
  });
  it("refuses invented options, a third priority, repeated priorities and out-of-range budgets", () => {
    for (const bad of [{ exp: "GOD" }, { lic: "B" }, { adv: "SPACE" }, { pri: "COMFORT,POWER,SPORT" }, { pri: "COMFORT,COMFORT" }, { pri: "NOPE" }, { pri: "" }, { bud: "10" }, { bud: "1000000" }, { bud: "12.5" }, { bud: "-5" }, { dur: "FOREVER" }, { pax: "3" }, { ack: "0" }]) {
      expect(parseAnswers({ ...valid, ...bad }).ok, JSON.stringify(bad)).toBe(false);
    }
  });
  it("refuses impossible or malformed dates", () => {
    for (const start of ["2027-02-30", "2027-13-01", "tomorrow", "2027-1-1"]) {
      const r = parseAnswers({ ...valid, start });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.missing).toContain("start");
    }
  });
  it("uses the first value of a repeated parameter and ignores unknown ones", () => {
    expect(parseAnswers({ ...valid, exp: ["BEGINNER", "ADVANCED"], extra: "x" })).toMatchObject({ ok: true, answers: { experience: "BEGINNER" } });
  });
});
