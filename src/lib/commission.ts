import type { Role } from "@prisma/client";

// Marketplace commission rules. Money is stored as integers in RON bani (exact, no floating point);
// rates are integers in basis points (100 bps = 1%). Amounts are rounded half up to a whole ban.
//
// - platform fleet (vehicles without an owner): 0%, the platform keeps 100%
// - individual OWNER: fixed 15%
// - RENTAL_COMPANY: configurable by an ADMIN per company, never below 5% (15% until an admin sets a rate)
export const OWNER_COMMISSION_BPS = 1500;
export const COMPANY_DEFAULT_COMMISSION_BPS = 1500;
export const COMPANY_MIN_COMMISSION_BPS = 500;
export const MAX_COMMISSION_BPS = 10000;

export type VehicleOwner = { role: Role; commissionBps: number | null };

export function commissionBpsFor(owner: VehicleOwner | null | undefined): number {
  if (!owner) return 0;
  if (owner.role === "RENTAL_COMPANY") {
    return Math.min(MAX_COMMISSION_BPS, Math.max(owner.commissionBps ?? COMPANY_DEFAULT_COMMISSION_BPS, COMPANY_MIN_COMMISSION_BPS));
  }
  return OWNER_COMMISSION_BPS;
}

// A rate an ADMIN may configure for a rental company.
export function isValidCompanyRate(bps: number): boolean {
  return Number.isInteger(bps) && bps >= COMPANY_MIN_COMMISSION_BPS && bps <= MAX_COMMISSION_BPS;
}

// Half-up rounding in pure integer arithmetic: floor((total * bps + 5000) / 10000).
export function commissionOf(totalPrice: number, bps: number): number {
  return Math.floor((totalPrice * bps + 5000) / 10000);
}

export type CommissionSnapshot = { commissionBps: number; commissionAmount: number; ownerAmount: number | null };

// Taken once, when the booking is created, and stored on the booking. The owner share is NULL for platform-fleet
// vehicles. `totalPrice` is the amount actually charged (after any discount); deposits or penalties are not part of it.
export function snapshotFor(totalPrice: number, owner: VehicleOwner | null | undefined): CommissionSnapshot {
  if (!owner) return { commissionBps: 0, commissionAmount: 0, ownerAmount: null };
  const commissionBps = commissionBpsFor(owner);
  const commissionAmount = commissionOf(totalPrice, commissionBps);
  return { commissionBps, commissionAmount, ownerAmount: totalPrice - commissionAmount };
}
