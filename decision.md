# decision.md — decisions, rules and constraints of Moto & ATV Rental

This document collects the **decisions, business rules and constraints** that shaped the project, as they stand at delivery. The chronological record of what the owner asked is in [log.md](log.md); the detailed rules are in [docs/business-rules.md](docs/business-rules.md) and the diagrams in [docs/architecture.md](docs/architecture.md). This file does not replace them: it says **who decided what, why, where it lives in the code and how it was checked**.

## How to read the tables

**Origin** says where the decision came from, so that a technical choice is never presented as a requirement of the owner:

- **Owner — explicit**: the owner wrote it as a requirement (prompt number from [log.md](log.md)).
- **Owner — approved**: the assistant proposed it and the owner approved it in writing (prompt number).
- **Assistant — technical choice**: chosen by the assistant under the autonomy the owner granted (P33), without a specific approval. These are the ones to question first.

**Status** is `Complete`, `Partial` or `Not implemented`, judged against the owner's wording, not against the assistant's own plan.

**Verified by** names the check that exercises the rule: *unit* (`npm test`, 187 tests), *int* (`npm run test:integration`, 120 tests on the guarded test database), *e2e* (`./e2e/run.sh`, scripts under `e2e/`), *locust* (`loadtests/`), *db:check* (`npm run db:check`, 21 read-only consistency checks). The numbers are those of the final verification run reported at the end of this file.

---

## 1. Purpose and objectives

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| A university project (CTI, UGAL) for an ATV and motorcycle rental business with a public booking site and an admin panel | Owner — explicit (P01) | The course project | `README.md` | — | Complete |
| The project became a **multi-vendor marketplace**: individuals put their vehicles up for rent, companies rent larger quantities, locations everywhere in Romania, payment in RON or EUR | Owner — explicit (P19, P20, P23 and the question-tool answers) | Wider and more realistic scope than one fleet | whole application | e2e, int | Complete |
| The target is a complete, working, secure, tested application with a professional frontend, not a prototype | Owner — explicit (P33) | Acceptance standard for the delivery | whole repository | final verification run | Complete |
| Everything shown as data that is not real must be labelled as demonstration data; no invented ratings, reviews or statistics | Owner — explicit (P26, P33) | Honesty of the demo | `prisma/seed.ts`, `prisma/seed-demo.ts`, page footers, vehicle descriptions | e2e (crawl) | Complete |

## 2. Technology stack and architecture

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| Next.js (App Router) with strict TypeScript | Owner — explicit (P01, P33) | Required stack | `src/app`, `tsconfig.json` | `tsc --noEmit`, build | Complete |
| PostgreSQL with Prisma and versioned migrations | Owner — explicit (P01, P33) | Required stack; needed for the exclusion constraint | `prisma/` | int, db:check | Complete |
| Migrations are applied only with `prisma migrate deploy`; new ones are generated with `migrate diff` and the one false-positive line (`ALTER COLUMN "period" DROP DEFAULT`) is removed by hand | Assistant — technical choice (the owner's brief P01 listed `prisma migrate dev`; the owner approved keeping the existing migrations and forbade resets in P26 and P33) | `migrate dev` reports false drift on the generated range column and offers to reset the database, which the owner forbade | `README.md` ("Migrations"), `prisma/migrations/` | Migrations applied to a scratch database, the test database and the development database without a reset | Complete |
| Auth.js v5 (credentials, JWT sessions that carry **only the user id**) | Owner — explicit that Auth.js is used (P01); the JWT-with-id-only design is an assistant choice made to satisfy P30 ("role read from the database") | A token can never grant a role | `src/auth.ts`, `src/lib/session.ts` | int (`current-user.int.test.ts`), e2e (`accounts.py`) | Complete |
| Zod validates every external input; every text field rejects NUL characters | Owner — explicit for Zod (P01, P33); NUL guard is an assistant choice | PostgreSQL cannot store NUL; the robustness script found two 500 errors before the guard | `src/lib/forms.ts`, `src/lib/validators.ts`, `src/lib/zod-text.ts`, `src/middleware.ts` | unit, e2e (`robustness.py`) | Complete |
| Tailwind CSS 4 with shadcn/ui-**style** components built in the repository without Radix | Owner — approved that shadcn/ui is kept (P26); the "style only, no Radix, no extra packages" implementation is an assistant choice because the owner also asked for no new dependencies (P26, P33) | Same look and structure as shadcn/ui, no extra packages | `src/components/ui/*`, `src/app/globals.css` | e2e (crawl), screenshots at 390 px and desktop | **Partial** (the shadcn CLI and Radix primitives are not used) |
| Four small UI packages (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) were the "four unused dependencies" of P26; they were kept because shadcn-style components need them, and they are now used. `next-auth` was added for Auth.js. No other dependency was added | Owner — approved keeping them (P26 point 10); the assistant explained why in its answer | Owner's rule: no new dependency unless unavoidable | `package.json` | `grep` of imports in the audit | Complete |
| Docker Compose with services `app` and `db`; PostgreSQL published on host port **5433** (override with `DB_PORT`, app port with `APP_PORT`) so the local PostgreSQL on 5432 is untouched | Owner — approved (P26 point 8); the variables, the uploads volume and "seed only on an empty database" are assistant choices | Local PostgreSQL already uses 5432; restarts must not reset data | `docker-compose.yml`, `Dockerfile` | Clean-clone `docker compose up --build` (positive and negative secret checks) | Complete |
| The image refuses to start with the `change-me` placeholders or an `AUTH_SECRET` shorter than 16 characters | Assistant — technical choice | `.env.example` has placeholders; Compose only checks that the variable is non-empty | `Dockerfile` (CMD) | Fresh clone with the placeholder `.env`: container exits 1 with the message | Complete |
| Layout `src/app`, `src/components`, `src/lib`, `prisma/`, `loadtests/` | Owner — explicit (P01, P33) | Required layout | repository | — | Complete |
| End-to-end checks are Python scripts that drive the application over HTTP (forms, server actions, uploads) and read the database with `psql`; the build goes to `.next-e2e` | Assistant — technical choice (Playwright and CI are out of scope per P01/P33; no browser automation is installed) | Real form and action coverage without a new dependency | `e2e/`, `next.config.ts` (`NEXT_DIST_DIR`) | The suite itself | Complete (no real browser engine; see limitations) |

## 3. Roles and authorization

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| Four roles `CUSTOMER`, `OWNER`, `RENTAL_COMPANY`, `ADMIN` (the first brief had two) | Owner — approved (P28 D1, P29 Q1, P33) | Marketplace needs providers | `prisma/schema.prisma` (`Role`), `src/lib/roles.ts` | unit, int, e2e | Complete |
| Authorization is server-side, from the **current database role** and ownership of the resource; roles in tokens or requests are never trusted; a demotion applies at once | Owner — approved (P30 point 2, P33) | Prevents stale or forged tokens | `src/lib/session.ts`, `src/lib/current-user.ts`, `src/lib/vehicle-access.ts` | int, e2e (`accounts.py`, `authorization.py`) | Complete |
| `ADMIN` can never be chosen at registration; roles change only through `/admin/users` by an admin; users cannot promote themselves | Owner — approved (P29 Q3, P33) | Privilege escalation | `src/lib/forms.ts` (`REGISTERABLE_ROLES`), `src/lib/users.ts` | unit, int, e2e (`accounts.py`) | Complete |
| An admin cannot change their own role and the last admin cannot be demoted; checks run under row locks so concurrent requests cannot leave zero admins; the change asks for a confirmation | Owner — approved (P30 point 3, P31, P33) | Admin lock-out | `src/lib/users.ts`, `src/app/admin/users/page.tsx` | int (`users.int.test.ts`), e2e | Complete |
| An `OWNER` or `RENTAL_COMPANY` can be demoted only when all their vehicles are `RETIRED`; a company with `QUOTED` offers cannot be demoted; owed balances only produce a warning; existing bookings are never cancelled | Owner — approved (P31 R3, R4, P33) | Orphaned vehicles and offers | `src/lib/users.ts` | int | Complete |
| An owner cannot book their own vehicle | Owner — approved (P29 Q2) | Conflict of interest | `src/lib/booking-service.ts` | int | Complete |
| `ADMIN` accounts do not rent | Assistant — technical choice, shown in the permission matrix the owner confirmed (P31) | Admin acts on bookings, not as a customer | `src/lib/booking-service.ts`, `src/lib/roles.ts` | int | Complete |
| Resources of other users do not exist for you (404, not 403) | Assistant — technical choice | Does not reveal which ids exist | pages and services | e2e (`authorization.py`) | Complete |
| `users.account_type` stays in the database, marked deprecated in the schema, and is not used by the code | Owner — approved (P30 point 1, P31) | Not deleting data or columns without a separate decision | `prisma/schema.prisma` | grep in the audit | Complete |
| Owners and companies see only their own vehicles, bookings and money | Owner — explicit (P33) | Marketplace privacy | `src/lib/provider-data.ts`, `src/app/provider/*` | e2e (`authorization.py`, `owner.py`, `finance.py`) | Complete |

## 4. Data model and database rules

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| A vehicle never has overlapping non-cancelled bookings, enforced by a generated `tstzrange` column and a GiST **exclusion constraint** (`btree_gist`) | Owner — explicit (P01, P33) | The critical rule must hold even if application code is bypassed | migration `20261024145752_booking_no_overlap`, `prisma/schema.prisma` | int, locust (852 attempts on one slot, one winner), e2e (6 users, one winner), db:check | Complete |
| At most one `ACTIVE` booking per vehicle by a **partial unique index**; the migration checks for incompatible data first and aborts instead of deleting anything | Owner — approved (P31 R1, P33) | Consistency of the "rented" state | migration `20261026090000_booking_history_and_snapshots` | Applied to scratch, test and development databases; db:check | Complete |
| `booking_status_history` (booking, from, to, actor, note, time) written in the same transaction as the status change; backfilled rows are marked `backfill:` and carry no invented actor or time; index `(booking_id, changed_at)` | Owner — approved (P28 D6, P29 Q8, P33) | Traceability of status changes without a general audit system | same migration, `src/lib/booking-service.ts` | int, db:check ("history matches status") | Complete |
| Commission snapshot (`commission_bps`, `commission_amount`, `owner_amount`) stored on the booking when it is created | Owner — explicit (P33) | Later rate changes must not alter old bookings | `prisma/schema.prisma`, `src/lib/commission.ts` | unit, int, e2e (`finance.py`) | Complete |
| **Money is stored as integers in bani and rates as integer basis points, not as `Decimal`** | Assistant — technical choice that **departs from the owner's wording** ("Folosește tipuri `Decimal` ... nu `float`", P33). The assistant documented and flagged it in its reports; the owner did not comment on it afterwards | Exact arithmetic with simple, testable integer rounding; the owner's real aim (no floats) is met | all money columns, `src/lib/commission.ts`, `src/lib/payments.ts` | unit, e2e (`finance.py`), db:check | **Deviation** (no recorded approval; only the exchange rate stored with an EUR payment is a `Decimal`) |
| Photos are rows in `vehicle_photos` (position 0 is the cover), vehicle specifications are columns, `imageUrl` is deprecated | Assistant — technical choice, following P20 (aesthetic photos) | Several photos per vehicle | migration `20261026140000_vehicle_photos_and_specs` | int, e2e | Complete |
| Optional `category` enum on vehicles (additive, nullable migration) | Owner — explicit for a Cruiser category (P38); enum design is an assistant choice | Existing type enum could not express sub-categories without a larger change | migration `20261028090000_vehicle_category` | unit, int, e2e, db:check ("category fits type") | Complete |
| Additional indexes for the dashboards, account pages and the pending count | Assistant — technical choice | Query efficiency (P33 asks to check it) | migration `20261027090000_query_indexes` | `EXPLAIN` on the pending count, db:check | Complete |
| Migrations never reset or delete data; the development database was never reset | Owner — explicit (P26, P33, P40, P41) | Protect the owner's data | `prisma/migrations/` | `prisma migrate status`: 13 migrations, up to date | Complete |

## 5. Bookings, concurrency and history

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| Bookings need an authenticated user; the e-mail in the request must equal the account e-mail (`400 email_mismatch`) | Owner — approved (P30 point 4, P33) | No impersonation through the e-mail field | `src/app/api/bookings/route.ts`, `src/lib/booking-service.ts` | int, e2e (`booking_api.py`) | Complete |
| Maximum **3 `PENDING`** bookings per user, counted after `SELECT … FOR UPDATE` on the user row in the same transaction; only `PENDING` counts | Owner — approved (P29 Q10, P30 point 5, P31, P33) | Stops abuse of unconfirmed bookings without new infrastructure | `src/lib/booking-service.ts` | int (`stress.int.test.ts`), e2e (8 simultaneous requests: exactly 3 succeed) | Complete |
| `startAt` must be strictly in the future, validated on the server | Owner — approved (P28 D9, P32) | No past bookings | `src/lib/validators.ts` | unit, e2e | Complete |
| Strict, server-side status transitions with conditional updates (`WHERE status = expected`) inside transactions; invalid or concurrent changes leave no partial change and no false history | Owner — explicit (P26 point 2, P33) | Concurrency safety | `src/lib/booking-rules.ts`, `src/lib/booking-service.ts` | unit, int, locust, e2e | Complete |
| Lock order users → quote → vehicles (sorted), a lock on the vehicle row at creation, and automatic retry of deadlock/serialization errors | Assistant — technical choice (found by a stress test: PostgreSQL deadlocks with 3 or more simultaneous conflicting inserts) | Conflicts must end as `409`, never as a 500 | `src/lib/tx.ts`, `src/lib/booking-service.ts` | int (30 users × 10 rounds, repeated three times in the audit), locust, e2e | Complete |
| A customer may cancel only before the start; after that only an admin; an admin cancellation needs a reason recorded in the history; no refunds or automatic fees | Owner — approved (P27 a, P28 D3, P29 Q4, P33) | Business policy | `src/lib/booking-rules.ts` | unit, int, e2e | Complete |
| The handover is recorded **manually** by an admin, from one hour before `startAt`; more than one hour after the start the booking shows `HANDOVER_DELAYED` and the handover needs a reason; nothing changes status because of time alone | Owner — approved (P27 b, P28 D2, P29 Q4 and Q5, P33) | Avoid automatic, unverifiable transitions | `src/lib/booking-rules.ts`, `src/app/admin/bookings/[id]/page.tsx` | unit, int, e2e (`company_and_admin.py`, `finance.py`, `maintenance.py`) | Complete |
| Completing is allowed with an unpaid balance: a warning is shown and nothing is marked paid | Owner — approved (P27 c, P33) | Practical operations | `src/lib/booking-service.ts` | int, e2e (`finance.py`) | Complete |
| Payments and payouts are recorded by hand; no online payments or transfers | Owner — explicit (P01, P33) | MVP scope | `src/app/admin/bookings/[id]`, `src/app/admin/payouts` | e2e (`finance.py`) | Complete |

## 6. Vehicle status and maintenance

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| Stored status is `AVAILABLE`, `IN_SERVICE` or `RETIRED`; `RENTED` is **derived** from an `ACTIVE` booking and stays in the enum unused | Owner — approved (P27 d, P28 D4, P29 Q6, P31, P33) | No inconsistency between booking and vehicle state | `src/lib/vehicle-rules.ts` | unit, e2e (`maintenance.py`) | Complete |
| `IN_SERVICE` and `RETIRED` are never overwritten by a booking ending or being cancelled; leaving service is an explicit admin action; `RETIRED → AVAILABLE` directly is forbidden (through `IN_SERVICE`) | Owner — approved (P28 D5, P29 Q7, P30, P31 R2, P33) | Safety of vehicles taken out of circulation | `src/lib/vehicle-rules.ts`, `src/lib/vehicle-service.ts` | unit, int, e2e | Complete |
| A vehicle that is out with a customer cannot be put in service or retired; upcoming bookings are reported to the admin and never cancelled automatically; a vehicle in service or retired cannot be booked or handed over | Owner — approved (P28 D5, P31, P33) | Consistency | `src/lib/vehicle-service.ts`, `src/lib/booking-rules.ts` | int, e2e (`maintenance.py`) | Complete |
| Service, ITP and RCA records with the date done and a next deadline; warnings for overdue, due soon (30 days) or missing documents; a warning never blocks a booking | Owner — explicit (P01, P33); the 30-day window is an assistant choice | Operational reminders | `src/lib/maintenance-*.ts`, admin and provider maintenance pages | unit, int, e2e (`maintenance.py`) | Complete |
| Listings of owners and companies need admin approval; changing the name or description of an approved listing sends it back to approval | Owner — explicit that listings are approved by an admin (question-tool answer, P33); the re-approval on edit is an assistant choice | Approval cannot be bypassed by editing afterwards | `src/lib/vehicle-service.ts` | int, e2e (`owner.py`) | Complete |

## 7. Bulk offers for rental companies

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| Large quantities are rented through a request for an offer; the system offers **what is really available**; the customer sees and accepts the final list explicitly | Owner — explicit/approved (question-tool answer, P26 point 3, P28, P33) | Never book beyond real capacity | `src/lib/quote-service.ts`, `src/app/provider/quotes` | int, e2e (`company_and_admin.py`) | Complete |
| `quote_items` store the exact vehicles and prices; `revision` identifies the version; accepting must send the revision seen; acceptance is atomic and all-or-nothing | Owner — approved (P29 Q9, P30 point 6, P33) | No silent partial confirmation | migration `20261026120000_quote_items_revision` | int, e2e | Complete |
| If anything changed, the offer is recalculated, `revision` increases and a new explicit acceptance is required; if nothing is left, nothing is booked; old offers without items are recalculated first | Owner — approved (P28, P30, P33) | Same | `src/lib/quote-service.ts` | int, e2e | Complete |
| No automatic expiry of offers | Owner — explicit (P29 Q9, P30, P33) | Needs a separate approval | — | — | Complete (intentionally absent) |
| Vehicles are assigned **automatically** from the available ones (platform fleet first, then owners with the fewest bookings); never the company's own vehicles | Owner — explicit that the assignment is automatic (question-tool answer to P23); the exact ordering is an assistant choice | Spreads bookings fairly | `src/lib/quote-service.ts` | int | Complete |
| Only `RENTAL_COMPANY` accounts request bulk offers; customers see an informative note | Assistant — technical choice resolving an ambiguity (P33 asked for the safest reading); flagged in the reports | The bulk flow is described for companies | `src/lib/roles.ts` | unit, e2e (`authorization.py`) | Complete (a different reading is possible) |
| Offers count calendar days in Bucharest time | Owner — approved (P28 D7 "calculul ofertelor în funcție de zile"); exact rule is an assistant choice | Clear price for DST-changing periods | `src/lib/quotes.ts`, `src/lib/business-time.ts` | unit (also under six time zones) | Complete |

## 8. Commission and financial rules

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| The platform does the renting and charges a commission to owners | Owner — explicit (P23) | Marketplace model | `src/lib/commission.ts` | unit, int | Complete |
| Platform fleet (no owner): **0%**; individual owner: fixed **15%**; rental company: set by an admin per company, **minimum 5%** (15% until set) | Owner — explicit (P33; per-owner rate chosen in the question-tool answer to P23) | Business model | `src/lib/commission.ts`, `src/app/admin/payouts/page.tsx` | unit, int, e2e (`finance.py`: 15% of 3333 → 500; company 7.5% → 250; platform 0) | Complete |
| Commission is computed on the amount actually charged; rounding is half up in whole bani; no commission on deposits, damages or penalties (none are modelled) | Owner — explicit (P33); the exact rounding rule is an assistant choice | Explicit, testable rounding | `src/lib/commission.ts` | unit, e2e | Complete |
| What is owed accrues only when a booking is `COMPLETED`; it is kept separate from payments received and payouts made | Owner — explicit (question-tool answer to P23, P33) | Cash-flow clarity | `src/lib/earnings.ts`, `src/lib/admin-data.ts` | int, e2e (`finance.py`: dashboards equal SQL) | Complete |
| Payments can be recorded in RON or EUR; an EUR payment stores the rate used (`EUR_RON_RATE`) | Owner — explicit that payment in RON or EUR is possible (question-tool answer to P20); how it is stored is an assistant choice | Exact history of the conversion | `src/lib/payments.ts`, `src/lib/currency.ts` | unit, e2e | Complete |
| Owners and companies see only their own financial data; CSV export only for admins; spreadsheet formulas are neutralized | Owner — explicit for privacy (P33); CSV hardening is an assistant choice | Data protection | `src/app/provider/finance`, `src/app/admin/finance/export/route.ts`, `src/lib/csv.ts` | unit, e2e | Complete |

## 9. Time zone and calendar

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| `Europe/Bucharest` for forms, display, weekend rules and offer days; timestamps stored in UTC (`timestamptz`) | Owner — approved (P28 D7, P29 Q11, P32, P33) | Business calendar | `src/lib/business-time.ts`, `src/lib/pricing.ts` | unit under six host time zones (`npm run test:tz`) | Complete |
| A nonexistent local time (spring-forward gap) is rejected; an ambiguous one (autumn overlap) resolves to its first occurrence | Assistant — technical choice | Deterministic handling of DST | `src/lib/business-time.ts` | unit | Complete |
| Weekend rate: Saturday 00:00 to Monday 00:00 Bucharest time; normal bookings are billed per started 24-hour block | Owner — explicit that weekend rules exist (P01, P32); the exact window and billing unit are assistant choices | Pricing clarity | `src/lib/pricing.ts` | unit | Complete |

## 10. Frontend and design

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| Landing page in three sections (catalog, locations, photos); dynamic locations from the database | Owner — explicit (P19 and its answers) | Presentation | `src/app/(public)/page.tsx`, `locations` table | e2e (crawl) | Complete |
| Modern, professional, premium, responsive UI with public, customer, provider and admin areas, real indicators, loading/empty/error/success states, no dead buttons or simulated saves | Owner — explicit (P33) | Product quality | `src/app`, `src/components` | e2e (`crawl.py` follows every link and image; forms exercised), screenshots at 390 px and desktop | Complete (see limitations for what could not be tested in a real browser) |
| Catalog filters (type, category, county, location, price, availability by dates, sort, pagination), vehicle page with gallery, specifications, calendar, live price estimate | Owner — explicit (P33) | Marketplace essentials | `src/lib/catalog.ts`, `src/app/(public)/vehicles` | unit, int, e2e | Complete |
| Currency switch RON/EUR, server-rendered charts, custom month calendar, no chart library | Assistant — technical choice | No extra dependency | `src/components/*` | screenshots | Complete |
| The catalog streams results in a `Suspense` boundary and there are no per-page `loading.tsx` files | Assistant — technical choice | A `loading.tsx` made unknown vehicles answer HTTP 200 instead of 404 | `src/app/(public)/vehicles/page.tsx` | e2e (404 checks) | **Partial** (loading skeletons only on the catalog) |
| Tables on phones scroll sideways, and the status or warning is repeated under the vehicle name below the `md` breakpoint | Assistant — technical choice | Status was out of view on 390 px | `src/app/admin/*`, `src/app/provider/bookings` | screenshots | Complete |

## 11. Vehicle categories and demo data

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| Main domain is ATVs and motorcycles; scooters stay in the enum but are not a central category | Owner — explicit (P33) | Focus | `prisma/schema.prisma`, UI | — | Complete |
| Categories: **Cruiser**, Adventure & touring, Naked & sport, Dual-sport & enduro, Sport ATV, Utility ATV; shown on cards and detail pages, in the filters and in the search; a category must fit the vehicle type; no rule of booking, authorization or commission depends on it | Owner — explicit for Cruiser and the families listed (P38); the exact set of six is an assistant choice | Browsing | `src/lib/vehicle-categories.ts`, `src/lib/catalog.ts` | unit, int, e2e, db:check | Complete |
| 17 real models in the demo fleet (4 cruisers, 3 adventure, 3 naked/sport, 2 dual-sport, 5 ATVs) with year, displacement and power from the manufacturers' pages (kW converted to hp; empty where the maker publishes none); plates, prices, locations and availability are invented | Owner — explicit (P38: real models, confirm specifications, do not claim current availability); the model selection is an assistant choice | Realistic catalog | `prisma/seed.ts` | e2e (`crawl.py`: 17 models, six categories) | Complete, with the caveats in section 16 |
| Photos are openly licensed images from Wikimedia Commons (CC BY, CC BY-SA, public domain), each credited with author, licence and source on the page; every demo vehicle has a photo of its own model | Owner — explicit (P19 answer "cauta pe net poze in functie de model", P20, P38: legally usable images that match the model) | Legal use and accuracy | `public/vehicles/`, `src/lib/photo-credits.json` | e2e (`crawl.py`: every seeded photo is served and credited) | Complete |
| Demo owner and company accounts are optional (`SEED_DEMO_USERS=true`, `DEMO_PASSWORD`), never created by default | Assistant — technical choice | No default passwords in a real deployment | `prisma/seed-demo.ts` | e2e | Complete |
| The seed is idempotent; it keeps prices an admin changed and adds maintenance records only to vehicles that have none | Owner — explicit that it must not duplicate or delete data (P40); implementation by the assistant | Safe re-runs | `prisma/seed.ts` | e2e (seed run three times, same row counts) | Complete |
| Locations and phone numbers in the seed are fictional placeholders marked as such | Owner — explicit (P26 "Datele de seed") | Do not present invented data as real | `prisma/seed.ts` | e2e | Complete |

## 12. Security and data protection

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| Passwords are hashed; no secrets in Git; `.env.example` holds placeholders only; `.env`, uploads and build output are ignored | Owner — explicit (P01) | Basic hygiene | `.gitignore`, `.env.example`, `src/lib/password.ts` | review, unit, e2e | Complete |
| Passwords moved from bcrypt (cost 12, pure JavaScript, blocked the event loop: with 50 simultaneous logins none finished in 30 s) to scrypt from `node:crypto` (N=2^15, r=8, p=3); bcrypt hashes still verify and are upgraded at login; unknown e-mails cost the same time as wrong passwords | Owner — approved the change under the condition of a verified, safe migration (the request of 2026-10-26 after the first audit); the algorithm is an assistant technical choice | Measured cause in [docs/performance.md](docs/performance.md); no new dependency; the cost was not lowered | `src/lib/password.ts`, `src/auth.ts` | unit (`password.test.ts`), e2e (`accounts.py`), Locust before and after | Complete; risk: the previous bcrypt-only code cannot read upgraded hashes |
| Store as little personal data as possible; nothing sensitive is logged | Owner — explicit (P01, P33) | Data minimisation | schema (name, e-mail, phone only) | review | Complete |
| Uploads: JPEG, PNG or WebP checked by their real content (magic bytes), 5 MB each, 8 per vehicle, random names, `nosniff`, path traversal returns 404 | Assistant — technical choice | Upload attacks | `src/lib/uploads.ts`, `src/lib/photo-service.ts`, `src/app/uploads/[...path]/route.ts` | unit, int, e2e (`owner.py`, `robustness.py`) | Complete |
| Security headers on every response, `X-Powered-By` off; no Content-Security-Policy | Assistant — technical choice | Next.js needs inline scripts | `next.config.ts` | e2e (`robustness.py`) | **Partial** (no CSP) |
| A middleware answers 400 for NUL bytes in a URL; hostile or malformed requests never produce a 5xx or leak internals | Assistant — technical choice, found by the final audit | Two real 500 errors were reproduced and fixed | `src/middleware.ts` | e2e (`robustness.py`, 44 checks) | Complete |
| Sessions are stateless JWTs: changing a password does not sign other devices out | Assistant — technical choice | Simplicity | `src/auth.ts` | documented | Known limitation |

## 13. Testing and acceptance criteria

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| `npm test` runs unit tests only; `npm run test:integration` is a separate command that runs on the database named by `TEST_DATABASE_URL`, validated **before** anything is created, migrated or deleted; it refuses a missing, remote, non-`_test`, or development database | Owner — approved (P28 D8, P29, P30 point 7, P33) | Never touch the development database | `scripts/test-integration.ts`, `src/test-support/safe-test-db.ts` | unit tests of the guard (`safe-test-db.test.ts`) | Complete |
| The unit tests run under six machine time zones | Assistant — technical choice, following P32 ("do not rely on the machine time zone") | Proof of time-zone independence | `scripts/test-timezones.ts` | `npm run test:tz` | Complete |
| After every stage: tests and regressions, TypeScript/build/lint, security and consistency, real functional verification | Owner — explicit (P33) | Acceptance method | stage reports | reports | Complete |
| Completion criteria: all roles work, end-to-end booking and cancel, partial offers cannot create wrong bookings, concurrent bookings cannot oversell, statuses stay consistent with bookings and maintenance, correct finance with snapshots, all tests and build pass, responsive frontend, documentation matches the code, no simulated features or dead buttons | Owner — explicit (P33 section 7) | Definition of done | whole repository | final verification run | Complete, subject to the limitations below |
| Load tests (Locust): visitors, logged-in customers and many users on one slot; exit code 1 if more than one booking wins | Owner — explicit that Locust and the same-slot scenario are required (P01, P33) | Concurrency evidence | `loadtests/`, `scripts/seed-loadtest.ts` | locust runs reported at the end | Complete |
| `npm run db:check` (21 read-only SQL checks of the consistency rules) | Assistant — technical choice, added in the final audit | A repeatable data-integrity proof | `scripts/check-integrity.ts` | run on the development database and on the test database after the e2e and load runs | Complete |

## 14. Git, commits and publication

| Decision | Origin | Rationale | Where | Verified by | Status |
|---|---|---|---|---|---|
| The repository is named `moto-atv-rental-bd2` and is private on GitHub | Owner — explicit (P09, P10, short prompts summarised in log.md) | — | remote `origin` | `git remote -v`, GitHub API | Complete |
| The assistant is **not** listed as co-author in commits (no `Co-Authored-By` trailer); the first commit was rewritten to remove it | Owner — explicit (P11, P12, P13, short prompts summarised in log.md) | The owner is the author of the work | `git log` | `git log` shows one author identity | Complete |
| Commits only when asked (P33); later: one commit per finished and verified stage, automatically (P36, P37); final commit and push (P40, P41) | Owner — explicit | Change of working agreement over time | `git log` (27 commits before the final one, in stage order, English messages) | `git log` | Complete |
| Never `reset --hard`, `clean -fd`, history rewriting after publication, or force push | Owner — explicit (P36, P40, P41) | Safety | — | The audit used none of them | Complete |
| Intermediate commits are not individually build-tested (the Prisma schema is one file shared by all stages); only the final tree is verified | Assistant — disclosed limitation | Splitting a single schema file by stage was not practical | — | A clean clone of the final commit builds, starts and passes the checks | Known limitation |

## 15. Deliberately excluded from the MVP

Online payments, Redis/BullMQ, Nginx/HTTPS, Playwright, CI, e-mails, PDF contracts, equipment, damages and deposits, a general audit log, automatic expiry of offers, automatic refunds or cancellation fees, extra rate limiting, e-mail verification (all **Owner — explicit**, P01, P29 Q10, P30, P33). They are mentioned only as future work.

## 16. Known limitations, contradictions found and future work

**Contradictions between the owner's wording and the final system (kept visible on purpose)**

1. **Decimal versus integers**: the owner asked for `Decimal` for money (P33); the system uses integer bani and basis points (section 4). No explicit approval was recorded.
2. **shadcn/ui**: kept in spirit (look and structure), but the components are written in the repository without the shadcn CLI and Radix (section 2).
3. **Two roles became four**: the first brief (P01) had `ADMIN` and `CUSTOMER`; the owner later approved four roles (P28 D1). The first brief is therefore superseded.
4. **`prisma migrate dev` in the first brief** was replaced by `migrate deploy` plus `migrate diff` (section 2).
5. **"Ask before every decision" (P25) was replaced by "work autonomously" (P33)**; the assistant kept asking only for the cases P33 listed.

**Limits of the delivered system**

- No real browser engine is available in the environment: layout was checked with headless Firefox screenshots at 390 px and desktop, and behaviour with HTTP-level scripts. Client-side JavaScript (live price estimate, gallery, calendar interactions) was checked through the API it calls, not by clicking.
- Only the catalog has a loading skeleton (section 10).
- No Content-Security-Policy; JWT sessions cannot be revoked (section 12).
- Bulk offers are for rental companies only; this reading of an ambiguity may differ from the owner's intent.
- A NUL character in a text field of a form that is not validated by Zod (authenticated admin/provider actions that read ids directly) could still reach the database and produce a server error; URLs and all Zod-validated inputs are protected.
- The CFMOTO CFORCE 850 XC specifications come from secondary sources (1000PS and a German database); the other 16 models use the manufacturers' pages. The BMW R 1300 GS "2024" year and the Africa Twin photo (a 2020 unit of the same generation) are the loosest matches. The number of seats was not confirmed on the manufacturers' pages for every model and is empty where unknown. The Polaris Sportsman photo is a rear view.
- Several demo vehicles of the optional demo accounts were renamed during the audit so that each name matches an available photo (the Honda TRX 420 became a Yamaha Raptor 700; the Polaris Scrambler 850 became a Polaris Scrambler).
- The current availability of any model in any market is **not** claimed.
- `next start` prints a warning about `output: "standalone"`; it works.

**Future work**: online payments and payouts, e-mail notifications, PDF contracts, a general audit log, session revocation, a Content-Security-Policy, real-browser end-to-end tests, per-page loading states, refund and cancellation-fee policies, expiry of offers, equipment and damages.

## Final verification run

The numbers for the final tree are in the final report of the delivery and in the commit message of the closing commit: unit, time-zone, integration and end-to-end results, the production build, the database integrity checks, the clean-environment Docker start and the load test.
