import { describe, expect, it } from "vitest";
import type { RideDnaAnswers } from "./answers";
import { PROFILE_IDS, deriveProfile } from "./profile";

const a = (over: Partial<RideDnaAnswers>): RideDnaAnswers => ({ experience: "INTERMEDIATE", licence: "A", adventure: "ROAD_TOURING", priorities: ["EXPLORATION"], budgetRon: 1000, duration: "ONE_DAY", start: null, passengers: 1, ...over });

describe("deriveProfile", () => {
  const cases: [string, Partial<RideDnaAnswers>, string][] = [
    ["a beginner who wants a quad", { adventure: "ATV_RECREATION", experience: "BEGINNER" }, "first-quad"],
    ["a quad ride for an experienced rider", { adventure: "ATV_RECREATION", experience: "ADVANCED" }, "quad-explorer"],
    ["off-road trails, intermediate", { adventure: "OFFROAD_TRAILS" }, "offroad-pioneer"],
    ["off-road trails, beginner", { adventure: "OFFROAD_TRAILS", experience: "BEGINNER" }, "trail-starter"],
    ["mixed terrain, exploring, 3 days", { adventure: "MIXED_TRAILS", duration: "THREE_DAYS" }, "mountain-explorer"],
    ["mixed terrain, short", { adventure: "MIXED_TRAILS", priorities: ["AGILITY"] }, "trail-seeker"],
    ["road, sporty", { priorities: ["SPORT"] }, "spirited-roadster"],
    ["road, power", { priorities: ["POWER", "COMFORT"] }, "spirited-roadster"],
    ["road, a week", { duration: "WEEK", priorities: ["EXPLORATION"] }, "touring-adventurer"],
    ["road, comfort, one day", { priorities: ["COMFORT"] }, "comfort-rider"],
    ["road, simplicity, a week", { priorities: ["SIMPLICITY"], duration: "WEEK" }, "touring-adventurer"],
    ["road, a weekend, exploring", { duration: "WEEKEND", priorities: ["EXPLORATION"] }, "weekend-explorer"],
    ["road, a few hours, agility", { duration: "HALF_DAY", priorities: ["AGILITY"] }, "weekend-explorer"],
    ["road, one day, exploring", { duration: "ONE_DAY", priorities: ["EXPLORATION"] }, "weekend-explorer"],
  ];
  it.each(cases)("%s", (_title, over, id) => {
    expect(deriveProfile(a(over)).id).toBe(id);
  });
  it("every rule is reachable and every profile has a name, a description and reminders", () => {
    const seen = new Set(cases.map((c) => c[2]));
    const reachable = [...seen, "road-explorer"];
    for (const id of PROFILE_IDS) expect(reachable, id).toContain(id);
    for (const [, over] of cases) {
      const p = deriveProfile(a(over));
      expect(p.name.length).toBeGreaterThan(3);
      expect(p.description.length).toBeGreaterThan(20);
      expect(p.reminders.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("the same answers always give the same profile, and different answers can give different ones", () => {
    expect(deriveProfile(a({ priorities: ["SPORT"] }))).toEqual(deriveProfile(a({ priorities: ["SPORT"] })));
    expect(deriveProfile(a({ priorities: ["SPORT"] })).id).not.toBe(deriveProfile(a({ priorities: ["COMFORT"] })).id);
  });
  it("lists what the user said and adds beginner and off-road reminders only when they apply", () => {
    const p = deriveProfile(a({ experience: "BEGINNER", adventure: "OFFROAD_TRAILS", passengers: 2 }));
    expect(p.facts.find((f) => f.label === "Riders")!.value).toMatch(/passenger/);
    expect(p.traits).toContain("With a passenger");
    expect(p.reminders.join(" ")).toMatch(/beginner/);
    expect(p.reminders.join(" ")).toMatch(/off-road/i);
    expect(deriveProfile(a({})).reminders.join(" ")).not.toMatch(/beginner|off-road/i);
  });
  it("does not present itself as an assessment of skills", () => {
    expect(deriveProfile(a({})).reminders[0]).toMatch(/not an assessment/);
  });
});
