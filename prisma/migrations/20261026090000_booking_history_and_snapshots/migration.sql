-- Stage 3: booking status history, one ACTIVE booking per vehicle, commission snapshot at creation.
-- Nothing is deleted or rewritten except filling NULL snapshot columns of bookings created before this migration.

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "from_status" "BookingStatus",
    "to_status" "BookingStatus" NOT NULL,
    "changed_by_id" TEXT,
    "note" TEXT,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_status_history_booking_id_changed_at_idx" ON "booking_status_history"("booking_id", "changed_at");

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------------------------------------
-- Backfill the history: ONE row per existing booking. The real actor and the real moments of the earlier
-- changes are not available, so they are not invented: from_status and changed_by_id stay NULL, changed_at is
-- the moment of this migration, and the note says so.
INSERT INTO "booking_status_history" ("id", "booking_id", "from_status", "to_status", "changed_by_id", "note", "changed_at")
SELECT 'bf_' || replace(gen_random_uuid()::text, '-', ''), b."id", NULL, b."status", NULL,
       'backfill: status observed at migration; original history unavailable', CURRENT_TIMESTAMP
FROM "bookings" b;

-- ---------------------------------------------------------------------------------------------------------
-- At most ONE ACTIVE booking per vehicle. Check first: if the data already violates the rule, STOP with a clear
-- message listing the vehicles. No booking is ever modified or deleted to make this index pass.
DO $$
DECLARE conflicts TEXT;
BEGIN
  SELECT string_agg(vehicle_id || ' (' || n || ' ACTIVE bookings)', ', ') INTO conflicts
  FROM (SELECT "vehicle_id", count(*) AS n FROM "bookings" WHERE "status" = 'ACTIVE' GROUP BY "vehicle_id" HAVING count(*) > 1) c;
  IF conflicts IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create bookings_one_active_per_vehicle: these vehicles already have several ACTIVE bookings, resolve them explicitly first: %', conflicts;
  END IF;
END $$;

CREATE UNIQUE INDEX "bookings_one_active_per_vehicle" ON "bookings" ("vehicle_id") WHERE "status" = 'ACTIVE';

-- ---------------------------------------------------------------------------------------------------------
-- Commission snapshot at creation. Bookings that already have a snapshot (completed under the previous rules)
-- keep it. Bookings without one get it computed with the current rules, half-up rounding:
-- platform fleet 0%, OWNER 15%, RENTAL_COMPANY its own rate with a 5% minimum (15% when none was set).
WITH rate AS (
  SELECT b."id" AS booking_id,
         (v."owner_id" IS NOT NULL) AS has_owner,
         CASE WHEN v."owner_id" IS NULL THEN 0
              WHEN u."role" = 'RENTAL_COMPANY' THEN GREATEST(COALESCE(u."commission_bps", 1500), 500)
              ELSE 1500 END AS bps
  FROM "bookings" b
  JOIN "vehicles" v ON v."id" = b."vehicle_id"
  LEFT JOIN "users" u ON u."id" = v."owner_id"
  WHERE b."commission_bps" IS NULL
)
UPDATE "bookings" b
SET "commission_bps" = r.bps,
    "commission_amount" = FLOOR((b."total_price"::numeric * r.bps + 5000) / 10000),
    "owner_amount" = CASE WHEN r.has_owner THEN b."total_price" - FLOOR((b."total_price"::numeric * r.bps + 5000) / 10000) ELSE NULL END
FROM rate r
WHERE r.booking_id = b."id";
