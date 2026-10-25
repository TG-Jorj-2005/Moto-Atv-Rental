-- Manual migration: Prisma cannot express exclusion constraints.
-- Apply with: npx prisma migrate dev --create-only --name booking_no_overlap
-- then paste this file into the generated migration.sql and run `npx prisma migrate dev`.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Half-open range [start, end): back-to-back bookings are allowed.
-- The init migration created `period` as a plain column (Unsupported type), so replace it.
ALTER TABLE bookings DROP COLUMN period;
ALTER TABLE bookings
  ADD COLUMN period tstzrange
  GENERATED ALWAYS AS (tstzrange(start_at, end_at, '[)')) STORED;

ALTER TABLE bookings
  ADD CONSTRAINT bookings_start_before_end CHECK (start_at < end_at);

-- A vehicle can never have two overlapping non-cancelled bookings.
ALTER TABLE bookings
  ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&)
  WHERE (status <> 'CANCELLED');
