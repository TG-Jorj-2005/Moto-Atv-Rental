import type { VehicleCategory, VehicleType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { localToInstant } from "@/lib/business-time";
import { calculatePrice } from "@/lib/pricing";
import { formatMoney, type CurrencyCode } from "@/lib/currency";
import { isStartInFuture } from "@/lib/validators";
import { DURATION_HOURS, type RideDnaAnswers } from "./answers";
import { compareRanked, evaluateVehicle, scoreLabel, type Reason, type VehicleFacts } from "./scoring";

// RideDNA: from the answers to at most three real vehicles. The vehicles come from the database (approved, not in
// service, not retired), the price comes from calculatePrice (the function the booking itself uses) and the
// availability from the same overlap rule as the price preview of the booking form. Nothing is written.

export const MAX_RESULTS = 3;
const MAX_CANDIDATES = 300;
// When the user has not chosen a date the price is an estimate for a weekday period of the chosen length. The reference
// day is a Tuesday in June, away from every clock change, so that the estimate does not depend on the day of the search.
const REFERENCE_START = { year: 2031, month: 6, day: 3, hour: 9, minute: 0, second: 0 };
const START_HOUR = 9;

export type Period = { startAt: Date; endAt: Date };
export type PeriodState = { kind: "EXACT"; period: Period } | { kind: "ESTIMATE"; period: Period } | { kind: "INVALID"; reason: "start_in_past" };

export function resolvePeriod(a: RideDnaAnswers, now: Date): PeriodState {
  const hours = DURATION_HOURS[a.duration];
  if (a.start) {
    const startAt = localToInstant({ ...a.start, hour: START_HOUR, minute: 0, second: 0 });
    if (!isStartInFuture(startAt, now)) return { kind: "INVALID", reason: "start_in_past" };
    return { kind: "EXACT", period: { startAt, endAt: new Date(startAt.getTime() + hours * 3_600_000) } };
  }
  const startAt = localToInstant(REFERENCE_START);
  return { kind: "ESTIMATE", period: { startAt, endAt: new Date(startAt.getTime() + hours * 3_600_000) } };
}

export type Recommendation = {
  id: string;
  name: string;
  type: VehicleType;
  category: VehicleCategory | null;
  year: number | null;
  engineCc: number | null;
  powerHp: number | null;
  seats: number | null;
  licenseCategory: string | null;
  locationLabel: string | null;
  photoPath: string | null;
  priceBani: number;
  priceLabel: string;
  available: boolean | null; // null = no dates chosen, availability not checked
  score: number;
  label: string;
  explanations: string[];
  dataGaps: string[];
};

export type Exclusion = Reason | "UNAVAILABLE";

export type RecommendationResult = {
  period: PeriodState;
  considered: number; // vehicles looked at
  eligible: number; // vehicles that passed every rule
  recommendations: Recommendation[]; // at most three
  excluded: Partial<Record<Exclusion, number>>;
  // vehicles that fail only the budget (or only the dates): what changing that one answer would give
  onlyOverBudget: { count: number; cheapestBani: number } | null;
  onlyUnavailable: number;
};

export async function recommend(a: RideDnaAnswers, opts: { currency: CurrencyCode; excludeOwnerId?: string | null; now?: Date }): Promise<RecommendationResult> {
  const now = opts.now ?? new Date();
  const period = resolvePeriod(a, now);
  const empty: RecommendationResult = { period, considered: 0, eligible: 0, recommendations: [], excluded: {}, onlyOverBudget: null, onlyUnavailable: 0 };
  if (period.kind === "INVALID") return empty;

  const vehicles = await prisma.vehicle.findMany({
    where: {
      listingStatus: "APPROVED",
      status: "AVAILABLE",
      ...(opts.excludeOwnerId ? { OR: [{ ownerId: null }, { ownerId: { not: opts.excludeOwnerId } }] } : {}),
    },
    orderBy: { id: "asc" },
    take: MAX_CANDIDATES,
    select: {
      id: true, name: true, type: true, category: true, year: true, engineCc: true, powerHp: true, seats: true, licenseCategory: true,
      hourlyRate: true, dailyRate: true, weekendRate: true,
      location: { select: { name: true, city: true } },
      photos: { orderBy: { position: "asc" }, take: 1, select: { path: true } },
    },
  });

  // Booked for the whole or part of the period (cancelled bookings do not count; back-to-back ones do not overlap).
  const busy = period.kind === "EXACT"
    ? new Set((await prisma.booking.findMany({ where: { vehicleId: { in: vehicles.map((v) => v.id) }, status: { not: "CANCELLED" }, startAt: { lt: period.period.endAt }, endAt: { gt: period.period.startAt } }, select: { vehicleId: true }, distinct: ["vehicleId"] })).map((b) => b.vehicleId))
    : null;

  const format = (bani: number) => formatMoney(bani, opts.currency);
  const excluded: Partial<Record<Exclusion, number>> = {};
  const ranked: Recommendation[] = [];
  let overBudgetOnly = 0;
  let cheapestOver = Infinity;
  let unavailableOnly = 0;

  for (const v of vehicles) {
    const priceBani = calculatePrice(period.period.startAt, period.period.endAt, { hourly: v.hourlyRate, daily: v.dailyRate, weekend: v.weekendRate });
    const facts: VehicleFacts = { id: v.id, name: v.name, type: v.type, category: v.category, powerHp: v.powerHp, engineCc: v.engineCc, seats: v.seats, licenseCategory: v.licenseCategory };
    const ev = evaluateVehicle(a, facts, priceBani, format);
    const unavailable = busy !== null && busy.has(v.id);
    const reasons: Exclusion[] = [...ev.reasons, ...(unavailable ? (["UNAVAILABLE"] as const) : [])];
    for (const r of reasons) excluded[r] = (excluded[r] ?? 0) + 1;
    if (reasons.length === 1 && reasons[0] === "OVER_BUDGET") {
      overBudgetOnly += 1;
      cheapestOver = Math.min(cheapestOver, priceBani);
    }
    if (reasons.length === 1 && reasons[0] === "UNAVAILABLE") unavailableOnly += 1;
    if (reasons.length > 0 || ev.score === null) continue;
    ranked.push({
      id: v.id, name: v.name, type: v.type, category: v.category, year: v.year, engineCc: v.engineCc, powerHp: v.powerHp, seats: v.seats, licenseCategory: v.licenseCategory,
      locationLabel: v.location ? `${v.location.name}, ${v.location.city}` : null,
      photoPath: v.photos[0]?.path ?? null,
      priceBani, priceLabel: format(priceBani),
      available: busy === null ? null : true,
      score: ev.score, label: scoreLabel(ev.score), explanations: ev.explanations, dataGaps: ev.dataGaps,
    });
  }

  ranked.sort(compareRanked);
  return {
    period,
    considered: vehicles.length,
    eligible: ranked.length,
    recommendations: ranked.slice(0, MAX_RESULTS),
    excluded,
    onlyOverBudget: overBudgetOnly > 0 ? { count: overBudgetOnly, cheapestBani: cheapestOver } : null,
    onlyUnavailable: unavailableOnly,
  };
}
