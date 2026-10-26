import { ADVENTURE_LABEL, DURATION_HOURS, DURATION_LABEL, EXPERIENCE_LABEL, LICENCE_LABEL, PRIORITY_LABEL, type RideDnaAnswers } from "./answers";

// The rider profile: a name and a short text chosen by fixed rules from the answers. It describes what the user
// said they want; it is not an assessment of riding skill.

export type RiderProfile = {
  id: string;
  name: string;
  description: string;
  traits: string[]; // short chips
  facts: { label: string; value: string }[]; // the answers, as they will be used
  reminders: string[]; // general advice, not claims about a vehicle
};

type Rule = { id: string; name: string; when: (a: RideDnaAnswers) => boolean; text: (a: RideDnaAnswers) => string };

const has = (a: RideDnaAnswers, p: RideDnaAnswers["priorities"][number]) => a.priorities.includes(p);
const longTrip = (a: RideDnaAnswers) => DURATION_HOURS[a.duration] >= 72;

// The first rule that matches wins. The order matters and is part of the documentation (docs/ridedna.md).
const RULES: Rule[] = [
  { id: "first-quad", name: "First-Trail Quad Rider", when: (a) => a.adventure === "ATV_RECREATION" && a.experience === "BEGINNER", text: () => "You want to try a quad and keep it easy: a forgiving ride on open trails, at your own pace." },
  { id: "quad-explorer", name: "Quad Explorer", when: (a) => a.adventure === "ATV_RECREATION", text: () => "You want the fun of a quad: trails, mud and open ground, with a vehicle that carries on where roads end." },
  { id: "offroad-pioneer", name: "Off-road Pioneer", when: (a) => a.adventure === "OFFROAD_TRAILS" && a.experience !== "BEGINNER", text: () => "You look for real trails and are ready for a vehicle built for rough ground." },
  { id: "trail-starter", name: "Trail Starter", when: (a) => a.adventure === "OFFROAD_TRAILS", text: () => "You are drawn to off-road trails but are only starting: light, forgiving machines come first." },
  { id: "mountain-explorer", name: "Mountain Explorer", when: (a) => a.adventure === "MIXED_TRAILS" && has(a, "EXPLORATION") && longTrip(a), text: () => "You want to cover ground over several days, on asphalt, gravel and forest roads alike." },
  { id: "trail-seeker", name: "Trail Seeker", when: (a) => a.adventure === "MIXED_TRAILS", text: () => "Forest roads, gravel and the odd bad surface are what you are after, with the road to get there." },
  { id: "spirited-roadster", name: "Spirited Roadster", when: (a) => a.adventure === "ROAD_TOURING" && (has(a, "SPORT") || has(a, "POWER")), text: () => "You ride paved roads for the pleasure of the ride: response, speed and a bike that feels alive." },
  { id: "touring-adventurer", name: "Touring Adventurer", when: (a) => a.adventure === "ROAD_TOURING" && longTrip(a), text: () => "You plan a proper journey on paved roads and want a bike that is good company for days." },
  { id: "comfort-rider", name: "Comfort Rider", when: (a) => a.adventure === "ROAD_TOURING" && (has(a, "COMFORT") || has(a, "SIMPLICITY")), text: () => "You want to enjoy the road without effort: an easy, comfortable ride." },
  { id: "weekend-explorer", name: "Weekend Explorer", when: (a) => a.adventure === "ROAD_TOURING" && DURATION_HOURS[a.duration] <= 48, text: () => "A short escape on good roads: a day or a weekend away from the routine." },
  { id: "road-explorer", name: "Road Explorer", when: () => true, text: () => "You like to discover new roads and want a bike that suits you." },
];

const REMINDERS = [
  "These are suggestions from what you told us, not an assessment of your riding skills.",
  "Wear a helmet and protective clothing, and check the licence rules for the vehicle you choose.",
];

export function deriveProfile(a: RideDnaAnswers): RiderProfile {
  const rule = RULES.find((r) => r.when(a))!;
  const traits = [EXPERIENCE_LABEL[a.experience], ADVENTURE_LABEL[a.adventure], ...a.priorities.map((p) => PRIORITY_LABEL[p]), DURATION_LABEL[a.duration], a.passengers === 2 ? "With a passenger" : "Riding alone"];
  const reminders = [...REMINDERS];
  if (a.experience === "BEGINNER") reminders.push("As a beginner, choose an easy first route and a quiet time of day.");
  if (a.adventure === "OFFROAD_TRAILS" || a.adventure === "ATV_RECREATION") reminders.push("Ride off-road only where it is allowed, and on a route you know or with someone who does.");
  return {
    id: rule.id,
    name: rule.name,
    description: rule.text(a),
    traits,
    facts: [
      { label: "Experience", value: EXPERIENCE_LABEL[a.experience] },
      { label: "Licence", value: LICENCE_LABEL[a.licence] },
      { label: "Adventure", value: ADVENTURE_LABEL[a.adventure] },
      { label: "Priorities", value: a.priorities.map((p) => PRIORITY_LABEL[p]).join(", ") },
      { label: "Duration", value: DURATION_LABEL[a.duration] },
      { label: "Riders", value: a.passengers === 2 ? "You and a passenger" : "Just you" },
      { label: "Budget", value: `${a.budgetRon} RON for the trip` },
    ],
    reminders,
  };
}

export const PROFILE_IDS = RULES.map((r) => r.id);
