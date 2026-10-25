// Read-only consistency report (npm run db:check). Runs only SELECTs against DATABASE_URL and exits with code 1 if a
// rule that the application and the database constraints are supposed to guarantee is violated.
import { PrismaClient } from "@prisma/client";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: DATABASE_URL may come from the real environment.
}

const CHECKS: { name: string; sql: string }[] = [
  { name: "no two non-cancelled bookings of a vehicle overlap", sql: `SELECT count(*) FROM bookings a JOIN bookings b ON a.vehicle_id = b.vehicle_id AND a.id < b.id AND a.status <> 'CANCELLED' AND b.status <> 'CANCELLED' AND a.period && b.period` },
  { name: "at most one ACTIVE booking per vehicle", sql: `SELECT count(*) FROM (SELECT vehicle_id FROM bookings WHERE status = 'ACTIVE' GROUP BY 1 HAVING count(*) > 1) x` },
  { name: "no user has more than 3 PENDING bookings", sql: `SELECT count(*) FROM (SELECT user_id FROM bookings WHERE status = 'PENDING' AND user_id IS NOT NULL GROUP BY 1 HAVING count(*) > 3) x` },
  { name: "every booking has at least one history row", sql: `SELECT count(*) FROM bookings b WHERE NOT EXISTS (SELECT 1 FROM booking_status_history h WHERE h.booking_id = b.id)` },
  { name: "the last history row of every booking matches its status", sql: `SELECT count(*) FROM bookings b WHERE b.status <> (SELECT h.to_status FROM booking_status_history h WHERE h.booking_id = b.id ORDER BY h.changed_at DESC, h.id DESC LIMIT 1)` },
  { name: "every booking made through the application stores its commission snapshot", sql: `SELECT count(*) FROM bookings b WHERE b.commission_bps IS NULL AND NOT EXISTS (SELECT 1 FROM booking_status_history h WHERE h.booking_id = b.id AND h.note LIKE 'backfill:%')` },
  { name: "commission + owner share equals the charged total (owned vehicles)", sql: `SELECT count(*) FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id WHERE v.owner_id IS NOT NULL AND b.commission_amount IS NOT NULL AND b.commission_amount + b.owner_amount <> b.total_price` },
  { name: "platform-fleet bookings have 0% commission and no owner share", sql: `SELECT count(*) FROM bookings b JOIN vehicles v ON v.id = b.vehicle_id WHERE v.owner_id IS NULL AND (coalesce(b.commission_bps, 0) <> 0 OR coalesce(b.owner_amount, 0) <> 0)` },
  { name: "commission rates are between 0 and 100% and company rates are at least 5%", sql: `SELECT (SELECT count(*) FROM bookings WHERE commission_bps < 0 OR commission_bps > 10000) + (SELECT count(*) FROM users WHERE role = 'RENTAL_COMPANY' AND commission_bps IS NOT NULL AND commission_bps < 500)` },
  { name: "no negative or zero money amounts", sql: `SELECT (SELECT count(*) FROM bookings WHERE total_price <= 0) + (SELECT count(*) FROM payments WHERE amount <= 0) + (SELECT count(*) FROM payouts WHERE amount <= 0) + (SELECT count(*) FROM vehicles WHERE hourly_rate <= 0 OR daily_rate <= 0)` },
  { name: "bookings end after they start", sql: `SELECT count(*) FROM bookings WHERE end_at <= start_at` },
  { name: "RENTED is never stored as a vehicle status", sql: `SELECT count(*) FROM vehicles WHERE status = 'RENTED'` },
  { name: "at least one ADMIN exists", sql: `SELECT CASE WHEN count(*) >= 1 THEN 0 ELSE 1 END FROM users WHERE role = 'ADMIN'` },
  { name: "only OWNER and RENTAL_COMPANY accounts own vehicles", sql: `SELECT count(*) FROM vehicles v JOIN users u ON u.id = v.owner_id WHERE u.role NOT IN ('OWNER', 'RENTAL_COMPANY')` },
  { name: "bookings of ADMIN accounts do not exist", sql: `SELECT count(*) FROM bookings b JOIN users u ON u.id = b.user_id WHERE u.role = 'ADMIN'` },
  { name: "a vehicle category always fits its type", sql: `SELECT count(*) FROM vehicles WHERE (category IN ('CRUISER','ADVENTURE','NAKED_SPORT','DUAL_SPORT') AND type <> 'MOTORCYCLE') OR (category IN ('ATV_SPORT','ATV_UTILITY') AND type <> 'ATV')` },
  { name: "every offer item belongs to an offer of a RENTAL_COMPANY", sql: `SELECT count(*) FROM quote_items i JOIN quote_requests q ON q.id = i.quote_id JOIN users u ON u.id = q.user_id WHERE u.role <> 'RENTAL_COMPANY'` },
  { name: "accepted offers created bookings", sql: `SELECT count(*) FROM quote_requests q WHERE q.status = 'ACCEPTED' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.quote_id = q.id)` },
  { name: "photo positions of a vehicle are unique", sql: `SELECT count(*) FROM (SELECT vehicle_id, position FROM vehicle_photos GROUP BY 1, 2 HAVING count(*) > 1) x` },
  { name: "EUR payments store the exchange rate they used", sql: `SELECT count(*) FROM payments WHERE currency = 'EUR' AND (exchange_rate IS NULL OR paid_amount IS NULL)` },
  { name: "emails are unique ignoring case", sql: `SELECT count(*) FROM (SELECT lower(email) FROM users GROUP BY 1 HAVING count(*) > 1) x` },
];

async function main() {
  const prisma = new PrismaClient();
  const target = new URL(process.env.DATABASE_URL ?? "postgresql://missing");
  console.log(`Read-only integrity check of ${target.pathname.slice(1)} on ${target.hostname}:${target.port}`);
  let failed = 0;
  try {
    for (const c of CHECKS) {
      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(c.sql);
      const bad = Number(Object.values(rows[0] ?? { x: 0 })[0]);
      console.log(`${bad === 0 ? "  OK   " : "  FAIL "} ${c.name}${bad === 0 ? "" : ` (${bad} violation${bad === 1 ? "" : "s"})`}`);
      if (bad !== 0) failed++;
    }
  } finally {
    await prisma.$disconnect();
  }
  console.log(failed === 0 ? `All ${CHECKS.length} checks passed.` : `${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
