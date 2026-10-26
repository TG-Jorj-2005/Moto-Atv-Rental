import { z } from "zod";
import { addDays, type LocalDate } from "@/lib/business-time";

// The questionnaire of RideDNA: the options of every question and the validation of the answers. The answers travel in
// the query string of the results page (nothing is stored in the database), so they are parsed from untrusted input.

export const EXPERIENCES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
export const LICENCES = ["NONE", "A2", "A"] as const;
export const ADVENTURES = ["ROAD_TOURING", "MIXED_TRAILS", "OFFROAD_TRAILS", "ATV_RECREATION"] as const;
export const PRIORITIES = ["COMFORT", "AGILITY", "POWER", "EXPLORATION", "SPORT", "SIMPLICITY"] as const;
export const DURATION_IDS = ["HALF_DAY", "ONE_DAY", "WEEKEND", "THREE_DAYS", "WEEK"] as const;

export type Experience = (typeof EXPERIENCES)[number];
export type Licence = (typeof LICENCES)[number];
export type Adventure = (typeof ADVENTURES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type DurationId = (typeof DURATION_IDS)[number];

export const DURATION_HOURS: Record<DurationId, number> = { HALF_DAY: 4, ONE_DAY: 24, WEEKEND: 48, THREE_DAYS: 72, WEEK: 168 };

export const MIN_BUDGET_RON = 50;
export const MAX_BUDGET_RON = 100_000;
export const MAX_PRIORITIES = 2;

export type RideDnaAnswers = {
  experience: Experience;
  licence: Licence;
  adventure: Adventure;
  priorities: Priority[]; // one or two, in the order chosen
  budgetRon: number; // for the whole trip, whole RON
  duration: DurationId;
  start: LocalDate | null; // first day (Bucharest) when the user already knows it
  passengers: 1 | 2;
};

export const EXPERIENCE_LABEL: Record<Experience, string> = { BEGINNER: "Beginner", INTERMEDIATE: "Intermediate", ADVANCED: "Advanced" };
export const LICENCE_LABEL: Record<Licence, string> = { NONE: "No motorcycle licence", A2: "Category A2", A: "Category A" };
export const ADVENTURE_LABEL: Record<Adventure, string> = {
  ROAD_TOURING: "Touring on paved roads",
  MIXED_TRAILS: "Forest roads and mixed terrain",
  OFFROAD_TRAILS: "Off-road trails",
  ATV_RECREATION: "Recreational ATV ride",
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  COMFORT: "Comfort",
  AGILITY: "Easy handling",
  POWER: "Power and performance",
  EXPLORATION: "Exploring far",
  SPORT: "Sporty feel",
  SIMPLICITY: "Simplicity",
};
export const DURATION_LABEL: Record<DurationId, string> = { HALF_DAY: "A few hours", ONE_DAY: "One day", WEEKEND: "A weekend (2 days)", THREE_DAYS: "3 days", WEEK: "A week" };

const dayText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// The form fields / query parameters. Strings only: they come from a URL.
const rawSchema = z.object({
  exp: z.enum(EXPERIENCES),
  lic: z.enum(LICENCES),
  adv: z.enum(ADVENTURES),
  pri: z.string().max(60),
  bud: z.string().regex(/^\d{1,6}$/),
  dur: z.enum(DURATION_IDS),
  start: dayText.optional(),
  pax: z.enum(["1", "2"]),
  ack: z.literal("1"),
});

export type ParseResult = { ok: true; answers: RideDnaAnswers } | { ok: false; missing: string[] };

type Raw = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

function parseDay(value: string): LocalDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const date = { year: +m[1]!, month: +m[2]!, day: +m[3]! };
  const check = addDays(date, 0);
  return check.year === date.year && check.month === date.month && check.day === date.day ? date : null;
}

// Never throws. `missing` names the questions that are absent or invalid, so the page can send the user back to them.
export function parseAnswers(raw: Raw): ParseResult {
  const candidate = Object.fromEntries(Object.keys(rawSchema.shape).map((k) => [k, first(raw[k])]));
  const parsed = rawSchema.safeParse(candidate);
  const missing = new Set<string>();
  if (!parsed.success) for (const issue of parsed.error.issues) missing.add(String(issue.path[0]));

  const priorities = (first(raw.pri) ?? "").split(",").filter(Boolean);
  const validPriorities = priorities.every((p) => (PRIORITIES as readonly string[]).includes(p)) && new Set(priorities).size === priorities.length && priorities.length >= 1 && priorities.length <= MAX_PRIORITIES;
  if (!validPriorities) missing.add("pri");

  const bud = Number(first(raw.bud));
  if (!Number.isInteger(bud) || bud < MIN_BUDGET_RON || bud > MAX_BUDGET_RON) missing.add("bud");

  let start: LocalDate | null = null;
  if (first(raw.start) !== undefined) {
    start = parseDay(first(raw.start)!);
    if (!start) missing.add("start");
  }
  if (missing.size > 0 || !parsed.success) return { ok: false, missing: [...missing] };
  const d = parsed.data;
  return {
    ok: true,
    answers: { experience: d.exp, licence: d.lic, adventure: d.adv, priorities: priorities as Priority[], budgetRon: bud, duration: d.dur, start, passengers: d.pax === "2" ? 2 : 1 },
  };
}

const pad = (n: number) => String(n).padStart(2, "0");
export const dayToText = (d: LocalDate) => `${d.year}-${pad(d.month)}-${pad(d.day)}`;

// The query string of the results page for a set of answers (the inverse of parseAnswers).
export function answersToQuery(a: RideDnaAnswers): URLSearchParams {
  const q = new URLSearchParams({ exp: a.experience, lic: a.licence, adv: a.adventure, pri: a.priorities.join(","), bud: String(a.budgetRon), dur: a.duration, pax: String(a.passengers), ack: "1" });
  if (a.start) q.set("start", dayToText(a.start));
  return q;
}
