# Database model (Stage 1)

PostgreSQL 16, managed with Prisma. The schema is [prisma/schema.prisma](../prisma/schema.prisma); every change is a SQL
file in [prisma/migrations](../prisma/migrations) (13 migrations). The ER diagram is in [architecture.md](architecture.md#er-diagram).
**12 tables** (the requirement is at least 6).

## Tables

| Table | Purpose | Main relations |
|---|---|---|
| `users` | Accounts: e-mail (unique), password hash (scrypt; old bcrypt hashes are upgraded at login), role, commission rate in basis points | owns `vehicles`; has `bookings`, `quote_requests`, `payouts` |
| `customers` | Contact details used on a booking (full name, e-mail, phone) | one per e-mail; has `bookings` |
| `locations` | Pick-up points in Romania (name unique, city, county, hours) | has `vehicles` |
| `vehicles` | The rentable vehicles: type, category, plate (unique), daily price, status, listing status, specifications | belongs to `users` (null = platform fleet) and `locations`; has photos, maintenance, bookings |
| `vehicle_photos` | Ordered photos of a vehicle | belongs to `vehicles` (cascade) |
| `bookings` | A rental: period, price, status, commission snapshot, owner share | belongs to `vehicles`, `users`, `customers`, optionally `quote_requests` |
| `booking_status_history` | One row per status change: from, to, who, note, when | belongs to `bookings` (restrict) |
| `payments` | Money received for a booking, in RON or EUR with the exchange rate used | belongs to `bookings` |
| `payouts` | Money paid out to an owner or company | belongs to `users` |
| `maintenance` | Service, ITP, RCA and other records with next due date | belongs to `vehicles` |
| `quote_requests` | A company's bulk request and its state, discount and revision | belongs to `users`; has `quote_items` and `bookings` |
| `quote_items` | The vehicles proposed in an offer with list and discounted price | belongs to `quote_requests` (cascade) and `vehicles` |

Cardinalities: a user has many vehicles, bookings, quotes and payouts; a vehicle has many bookings, photos and maintenance
records; a booking has many payments and many history rows; an offer has many items and, once accepted, many bookings.

## Integrity rules enforced by the database

| Rule | Mechanism |
|---|---|
| No two non-cancelled bookings of one vehicle overlap | generated column `period tstzrange` + `EXCLUDE USING gist (vehicle_id WITH =, period WITH &&) WHERE status <> 'CANCELLED'` (`booking_no_overlap`, needs `btree_gist`) |
| One `ACTIVE` booking per vehicle | partial unique index `bookings_one_active_per_vehicle` |
| A booking ends after it starts | `CHECK (start_at < end_at)` |
| E-mail, plate, location name unique | unique indexes |
| History survives | `booking_status_history` references bookings with `ON DELETE RESTRICT`; bookings are never deleted |
| Money is exact | integer bani and basis points, no floating point |

The overlap constraint and the partial indexes cannot be expressed in Prisma, so they live in hand-written migrations.
This is why `prisma migrate deploy` is used and `migrate dev` is not (see the README).

## Indexes

| Index | Query it serves |
|---|---|
| `bookings (vehicle_id, start_at)` and the exclusion index | availability of a vehicle for a period, overlap checks |
| `bookings (user_id, status)` | "my bookings", the limit of 3 `PENDING` per user |
| `bookings (status, start_at)` | admin lists by status, late-handover alerts |
| `bookings (customer_id)` | foreign key lookups |
| `vehicles (listing_status, status)`, `(category)`, `(owner_id)` | catalog filters, moderation queue, provider lists |
| `booking_status_history (booking_id, changed_at)` | the history of one booking in order |
| `maintenance (vehicle_id, type, performed_at)` | latest record of each type per vehicle |
| `quote_requests (user_id, status)`, `quote_items (vehicle_id)`, unique `(quote_id, vehicle_id)` | offers of a company, allocation |
| `payments (booking_id)`, `payouts (owner_id)`, `vehicle_photos (vehicle_id, position)` | foreign keys |

Execution plans of the important queries are in [performance.md](performance.md).

## Normalization

Prices and commission amounts on a booking are **snapshots on purpose** (they must not change when the vehicle price or
the owner's rate changes later); everything else is stored once and referenced by key. Customer contact data is in its
own table, vehicle photos and specifications are not repeated in bookings. `users.account_type` is a deprecated column that
the code never reads (kept to avoid a destructive migration).

## Fixtures and seed

| What | Command | Contents |
|---|---|---|
| Base seed (also run by the Docker image, only when the database has no users) | `npx prisma db seed` | the administrator from `ADMIN_EMAIL` / `ADMIN_PASSWORD`, 12 locations, 17 platform-fleet vehicles with specifications and credited photos |
| Demo accounts and activity | `SEED_DEMO_USERS=true DEMO_PASSWORD=... npx prisma db seed` | 2 customers, 1 owner, 1 company, their vehicles (approved, pending, rejected), maintenance, bookings in every status, a payout, an open offer |
| Load-test data | `npm run loadtest:seed` | 200 users and 12 vehicles in the **test** database only |

The seeds are idempotent (an end-to-end check runs the seed three times and compares the row counts). Demo users are created
**only** when `SEED_DEMO_USERS=true`; the load-test and test helpers refuse any database whose name does not end in `_test`.
The base seed does put the 17 demonstration vehicles of the platform fleet in a fresh production database: they are labelled
as demonstration data and an administrator can retire them.

RideDNA ([ridedna.md](ridedna.md)) reads these tables and **adds no table, column or migration**; the answers of the questionnaire are not stored.

## Checks

`npm run db:check` runs 21 read-only consistency queries on the database in `DATABASE_URL` (no overlaps, history present,
commission arithmetic, ...). Integration tests (`npm run test:integration`, 120 tests) exercise the constraints on a real PostgreSQL.
