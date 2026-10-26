import type { VehicleCategory, VehicleType } from "@prisma/client";
import { CATEGORY_BLURBS, CATEGORY_LABELS } from "@/lib/vehicle-categories";
import { ADVENTURE_LABEL, EXPERIENCE_LABEL, PRIORITY_LABEL, type Adventure, type Experience, type Licence, type Priority, type RideDnaAnswers } from "./answers";

// The recommendation rules of RideDNA, as pure functions of the answers and of the facts stored about a vehicle.
// Two separate steps: ELIGIBILITY (hard rules; a high score never compensates a failed rule) and SCORING (0 to 100,
// only for eligible vehicles). Nothing here is random, nothing reads the database or the clock.

export type VehicleFacts = {
  id: string;
  name: string;
  type: VehicleType;
  category: VehicleCategory | null;
  powerHp: number | null;
  engineCc: number | null;
  seats: number | null;
  licenseCategory: string | null;
};

// Weights of the four criteria (sum 100). A criterion whose data is missing is left out and the others are rescaled:
// a missing value is neither rewarded nor punished, and the gap is reported to the user.
export const WEIGHTS = { adventure: 40, preferences: 30, experience: 15, budget: 15 } as const;
export type CriterionKey = keyof typeof WEIGHTS;

// How well a category suits an adventure (0 = not intended for it: the vehicle is not recommended for that use).
// Editorial judgement based on the description of each category (see CATEGORY_BLURBS).
export const ADVENTURE_FIT: Record<VehicleCategory, Record<Adventure, number>> = {
  CRUISER: { ROAD_TOURING: 0.9, MIXED_TRAILS: 0, OFFROAD_TRAILS: 0, ATV_RECREATION: 0 },
  ADVENTURE: { ROAD_TOURING: 1, MIXED_TRAILS: 1, OFFROAD_TRAILS: 0.6, ATV_RECREATION: 0 },
  NAKED_SPORT: { ROAD_TOURING: 0.8, MIXED_TRAILS: 0, OFFROAD_TRAILS: 0, ATV_RECREATION: 0 },
  DUAL_SPORT: { ROAD_TOURING: 0.4, MIXED_TRAILS: 0.9, OFFROAD_TRAILS: 1, ATV_RECREATION: 0 },
  ATV_SPORT: { ROAD_TOURING: 0, MIXED_TRAILS: 0.5, OFFROAD_TRAILS: 0.8, ATV_RECREATION: 1 },
  ATV_UTILITY: { ROAD_TOURING: 0, MIXED_TRAILS: 0.6, OFFROAD_TRAILS: 0.9, ATV_RECREATION: 1 },
};

// Character of each category for the priorities that are a matter of style (0 to 1). POWER and SIMPLICITY are not
// here: they come from the horsepower stored for the vehicle.
type Style = "COMFORT" | "AGILITY" | "EXPLORATION" | "SPORT";
export const CATEGORY_TRAITS: Record<VehicleCategory, Record<Style, number>> = {
  CRUISER: { COMFORT: 0.9, AGILITY: 0.4, EXPLORATION: 0.4, SPORT: 0.2 },
  ADVENTURE: { COMFORT: 0.8, AGILITY: 0.5, EXPLORATION: 1, SPORT: 0.3 },
  NAKED_SPORT: { COMFORT: 0.3, AGILITY: 1, EXPLORATION: 0.4, SPORT: 1 },
  DUAL_SPORT: { COMFORT: 0.3, AGILITY: 0.9, EXPLORATION: 0.9, SPORT: 0.5 },
  ATV_SPORT: { COMFORT: 0.2, AGILITY: 0.8, EXPLORATION: 0.6, SPORT: 0.9 },
  ATV_UTILITY: { COMFORT: 0.6, AGILITY: 0.5, EXPLORATION: 0.8, SPORT: 0.3 },
};

// Power levels, from the horsepower stored for the vehicle. Our own guidance, not a legal or an insurer's rule.
export const LOW_POWER_MAX_HP = 50;
export const MEDIUM_POWER_MAX_HP = 100;
export const INTERMEDIATE_MAX_HP = 130;
export type PowerLevel = "LOW" | "MEDIUM" | "HIGH";
export const powerLevel = (hp: number): PowerLevel => (hp <= LOW_POWER_MAX_HP ? "LOW" : hp <= MEDIUM_POWER_MAX_HP ? "MEDIUM" : "HIGH");

const EXPERIENCE_FIT: Record<Experience, Record<PowerLevel, number>> = {
  BEGINNER: { LOW: 1, MEDIUM: 0.5, HIGH: 0 },
  INTERMEDIATE: { LOW: 0.7, MEDIUM: 1, HIGH: 0.6 },
  ADVANCED: { LOW: 0.5, MEDIUM: 0.8, HIGH: 1 },
};

const LICENCE_RANK: Record<string, number> = { A1: 1, A2: 2, A: 3 };
const HELD_RANK: Record<Licence, number> = { NONE: 0, A2: 2, A: 3 };

export type Reason =
  | "NO_CATEGORY"
  | "NOT_FOR_ADVENTURE"
  | "LICENCE_REQUIRED"
  | "LICENCE_TOO_LOW"
  | "LICENCE_UNKNOWN"
  | "TOO_POWERFUL"
  | "POWER_UNKNOWN"
  | "SEATS"
  | "OVER_BUDGET";

export const REASON_TEXT: Record<Reason, string> = {
  NO_CATEGORY: "its category is not recorded, so its intended use cannot be judged",
  NOT_FOR_ADVENTURE: "its category is not intended for the kind of ride you chose",
  LICENCE_REQUIRED: "it needs a motorcycle licence",
  LICENCE_TOO_LOW: "it needs a higher licence category than the one you hold",
  LICENCE_UNKNOWN: "the licence category it needs is not recorded",
  TOO_POWERFUL: "it is more powerful than we suggest for your experience",
  POWER_UNKNOWN: "its power is not recorded, so it cannot be judged for a beginner",
  SEATS: "it is not recorded as having a seat for a passenger",
  OVER_BUDGET: "the estimated price is above your budget",
};

// Hard rules. Returns every rule the vehicle fails (an empty list = eligible). `priceBani` is the estimate for the trip.
export function eligibilityReasons(a: RideDnaAnswers, v: VehicleFacts, priceBani: number): Reason[] {
  const reasons: Reason[] = [];
  if (!v.category) reasons.push("NO_CATEGORY");
  else if (ADVENTURE_FIT[v.category][a.adventure] === 0) reasons.push("NOT_FOR_ADVENTURE");

  if (v.type === "MOTORCYCLE") {
    const needed = v.licenseCategory ? LICENCE_RANK[v.licenseCategory.toUpperCase()] : undefined;
    const held = HELD_RANK[a.licence];
    if (held === 0) reasons.push("LICENCE_REQUIRED");
    else if (needed === undefined) {
      if (a.licence !== "A") reasons.push("LICENCE_UNKNOWN"); // only the highest category covers an unrecorded requirement
    } else if (held < needed) reasons.push("LICENCE_TOO_LOW");
  }

  if (v.powerHp === null) {
    if (a.experience === "BEGINNER") reasons.push("POWER_UNKNOWN");
  } else if ((a.experience === "BEGINNER" && powerLevel(v.powerHp) === "HIGH") || (a.experience === "INTERMEDIATE" && v.powerHp > INTERMEDIATE_MAX_HP)) {
    reasons.push("TOO_POWERFUL");
  }

  if (a.passengers === 2 && (v.seats === null || v.seats < 2)) reasons.push("SEATS");
  if (priceBani > a.budgetRon * 100) reasons.push("OVER_BUDGET");
  return reasons;
}

export type Criterion = { key: CriterionKey; weight: number; fit: number | null; text: string | null; gap: string | null };

export type Evaluation = {
  eligible: boolean;
  reasons: Reason[];
  score: number | null; // 0..100, whole number, only when eligible
  criteria: Criterion[];
  explanations: string[]; // what supports the score, only facts that are stored
  dataGaps: string[]; // criteria that could not be judged for lack of data
};

export const EXCELLENT_MIN = 85;
export const GOOD_MIN = 70;
export const FAIR_MIN = 50;
export function scoreLabel(score: number): string {
  return score >= EXCELLENT_MIN ? "Excellent match" : score >= GOOD_MIN ? "Good match" : score >= FAIR_MIN ? "Fair match" : "Possible match";
}

function adventureCriterion(a: RideDnaAnswers, v: VehicleFacts): Criterion {
  if (!v.category) return { key: "adventure", weight: WEIGHTS.adventure, fit: null, text: null, gap: "Category not recorded" };
  const fit = ADVENTURE_FIT[v.category][a.adventure];
  return { key: "adventure", weight: WEIGHTS.adventure, fit, text: `${CATEGORY_LABELS[v.category]} suits "${ADVENTURE_LABEL[a.adventure].toLowerCase()}": ${CATEGORY_BLURBS[v.category].replace(/\.$/, "").toLowerCase()}.`, gap: null };
}

function priorityFit(p: Priority, v: VehicleFacts): { fit: number | null; text: string | null; gap: string | null } {
  if (p === "POWER" || p === "SIMPLICITY") {
    if (v.powerHp === null) return { fit: null, text: null, gap: "Power not recorded" };
    if (p === "POWER") return { fit: Math.min(1, v.powerHp / 120), text: `${v.powerHp} hp for "${PRIORITY_LABEL.POWER.toLowerCase()}".`, gap: null };
    const fit = v.powerHp <= LOW_POWER_MAX_HP ? 1 : v.powerHp <= 75 ? 0.8 : v.powerHp <= MEDIUM_POWER_MAX_HP ? 0.5 : 0.25;
    return { fit, text: `${v.powerHp} hp, ${fit >= 0.8 ? "approachable" : "a lot of power"}, for "${PRIORITY_LABEL.SIMPLICITY.toLowerCase()}".`, gap: null };
  }
  if (!v.category) return { fit: null, text: null, gap: "Category not recorded" };
  const fit = CATEGORY_TRAITS[v.category][p];
  return { fit, text: `${CATEGORY_LABELS[v.category]} scores ${Math.round(fit * 100)}% on "${PRIORITY_LABEL[p].toLowerCase()}" in our category guide.`, gap: null };
}

function preferencesCriterion(a: RideDnaAnswers, v: VehicleFacts): Criterion {
  const parts = a.priorities.map((p) => priorityFit(p, v));
  const known = parts.filter((p) => p.fit !== null);
  if (known.length === 0) return { key: "preferences", weight: WEIGHTS.preferences, fit: null, text: null, gap: parts[0]?.gap ?? "No data" };
  const fit = known.reduce((s, p) => s + p.fit!, 0) / known.length;
  const gap = parts.find((p) => p.fit === null)?.gap ?? null;
  return { key: "preferences", weight: WEIGHTS.preferences, fit, text: known.map((p) => p.text).join(" "), gap };
}

function experienceCriterion(a: RideDnaAnswers, v: VehicleFacts): Criterion {
  if (v.powerHp === null) return { key: "experience", weight: WEIGHTS.experience, fit: null, text: null, gap: "Power not recorded" };
  const level = powerLevel(v.powerHp);
  const fit = EXPERIENCE_FIT[a.experience][level];
  return { key: "experience", weight: WEIGHTS.experience, fit, text: `${v.powerHp} hp is a ${level.toLowerCase()} power level for a ${EXPERIENCE_LABEL[a.experience].toLowerCase()} rider.`, gap: null };
}

function budgetCriterion(a: RideDnaAnswers, priceBani: number, format: (bani: number) => string): Criterion {
  const ratio = priceBani / (a.budgetRon * 100);
  const fit = ratio <= 0.5 ? 1 : Math.max(0, 1 - (0.6 * (ratio - 0.5)) / 0.5);
  return { key: "budget", weight: WEIGHTS.budget, fit, text: `Estimated ${format(priceBani)} for the trip, ${ratio <= 1 ? "within" : "above"} your budget of ${format(a.budgetRon * 100)}.`, gap: null };
}

// Full evaluation of one vehicle. `priceBani` is the price of the period (the exact one when dates were chosen,
// otherwise the estimate for the chosen duration), `format` writes an amount in the currency of the page.
export function evaluateVehicle(a: RideDnaAnswers, v: VehicleFacts, priceBani: number, format: (bani: number) => string = (b) => `${Math.round(b / 100)} RON`): Evaluation {
  const reasons = eligibilityReasons(a, v, priceBani);
  const criteria = [adventureCriterion(a, v), preferencesCriterion(a, v), experienceCriterion(a, v), budgetCriterion(a, priceBani, format)];
  const dataGaps = [...new Set(criteria.map((c) => c.gap).filter((g): g is string => g !== null))];
  if (reasons.length > 0) return { eligible: false, reasons, score: null, criteria, explanations: [], dataGaps };

  const evaluable = criteria.filter((c) => c.fit !== null);
  const totalWeight = evaluable.reduce((s, c) => s + c.weight, 0);
  const raw = totalWeight === 0 ? 0 : (evaluable.reduce((s, c) => s + c.weight * c.fit!, 0) / totalWeight) * 100;
  const score = Math.max(0, Math.min(100, Math.round(raw)));

  const explanations = criteria.map((c) => c.text).filter((t): t is string => t !== null);
  if (v.type === "MOTORCYCLE" && v.licenseCategory && LICENCE_RANK[v.licenseCategory.toUpperCase()] !== undefined) explanations.push(`Needs licence ${v.licenseCategory}, which matches the one you said you hold.`);
  if (a.passengers === 2 && v.seats !== null) explanations.push(`Has ${v.seats} seats for you and a passenger.`);
  return { eligible: true, reasons, score, criteria, explanations, dataGaps };
}

// Order: higher score first; then the lower estimated price; then the name; then the id (so that the order never
// changes between two runs with the same data).
export function compareRanked(a: { score: number; priceBani: number; name: string; id: string }, b: { score: number; priceBani: number; name: string; id: string }): number {
  return b.score - a.score || a.priceBani - b.priceBani || a.name.localeCompare(b.name, "en") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
