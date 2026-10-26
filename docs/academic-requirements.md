# Checklist of the course stages (0 to 6)

Stages as shown on the course slide "Etapele proiectului" (Baze de date avansate, Cursul 1, slide 19):
0 Theme (document: the domain of the theme) · 1 Modelling (at least 6 tables, relations, fixtures) · 2 CRUD (CRUD operations, description of the pages) ·
3 Authentication (authentication, at least 3 roles) · 4 Performance (indexes, load test) · 5 Reports (PDF, CSV or Excel) · 6 Defence (final presentation).
The slide also says that the requirements of the earlier stages must stay fulfilled and that the presentation document is completed along the way.
The performance criteria below are our own; the slide gives no thresholds.

Status after the audit of 2026-10-26 (second pass). "Fulfilled" means the evidence below exists and was run in this session.

| Stage | Requirement | Concrete evidence | Test / verification (run 2026-10-26) | Status |
|---|---|---|---|---|
| 0 | Document describing the domain | [domain.md](domain.md), [business-rules.md](business-rules.md), [README](../README.md), [decision.md](../decision.md) | Reviewed against the code; figures corrected (17 platform vehicles) | Fulfilled |
| 1 | At least 6 tables, relations, fixtures | 12 tables in [schema.prisma](../prisma/schema.prisma), 13 migrations, ER in [architecture.md](architecture.md#er-diagram), descriptions in [database.md](database.md); seeds `prisma/seed.ts`, `prisma/seed-demo.ts`, `scripts/seed-loadtest.ts` | 13 migrations applied on a fresh empty database (12 tables, overlap and partial-index constraints present, no schema drift beyond the known false positive); `npm run test:integration` 151 passed; `npm run db:check` 21/21; seed run three times adds no rows | Fulfilled |
| 2 | CRUD operations and description of the pages | [pages.md](pages.md): every page, role and action, and a CRUD matrix with the reason where an entity is archived instead of deleted. Maintenance records now have **create, read, update and delete** | `e2e/*.py` 401 checks over real forms (incl. 13 new for editing a maintenance record: prefilled form, same row updated, refused dates and types, foreign provider and customer refused, admin allowed, vehicle status untouched); 3 new integration tests | Fulfilled, with documented exceptions (no deletion of locations, bookings, payments, payouts and users, by business rule) |
| 3 | Authentication and at least 3 roles | 4 roles, Auth.js credentials, scrypt hashes with transparent upgrade of old bcrypt hashes, role read from the database on every request, `requireRole`, ownership checks in services | e2e `accounts` (26) and `authorization` (71): positive and negative cases for the four roles, forged and expired sessions, other users' data; `users.int.test.ts`; 9 unit tests of the hashing and 3 integration tests of the upgrade (simultaneous logins, compare-and-set); in a real browser: wrong password refused, right one signs in, a customer on `/admin` gets *Access denied* | Fulfilled |
| 4 | Indexes and load test | Indexes and plans: [database.md](database.md), [performance.md](performance.md); Locust in `loadtests/` (new `LoginOnly` scenario); raw results in `docs/load-results/` | Locust before and after the hashing change (same machine, data, commands): 100 users p95 23 s → 990 ms, 0 failures, one winner per contested slot; login alone with 50 users: no login in 30 s → 200 logins; `UV_THREADPOOL_SIZE=16` measured twice and not adopted | Fulfilled for what the slide asks (indexes, load test). Our own criterion "login median under 3 s with 50 users logging in without pause" is not met on one process (5.5 s; 2.2 s with `UV_THREADPOOL_SIZE=16`) |
| 5 | PDF, CSV or Excel | CSV: `/admin/finance/export`, `/provider/finance/export`, date filters, forms on both finance pages ([reports-and-export.md](reports-and-export.md)) | 4 unit and 4 integration tests (day boundaries to the millisecond in winter and summer time, clock-change days, isolation, encoding, money, formula injection) and 8 e2e checks (roles, isolation, filters equal SQL). The file was not opened in a spreadsheet program | Fulfilled |
| 6 | Final presentation | [presentation.md](presentation.md) (preparation, demo order, accounts, slide outline, tests, limitations), [screenshots/](screenshots/) | Tests listed with real results; 94 checks of the main flows and RideDNA in a scripted real browser (`./e2e/browser/run.sh`); Docker Compose started and answered; screenshots; [manual-verification.md](manual-verification.md) for the person's rehearsal. A rehearsal by a person in an interactive browser was **not** done | Partial |

## Why the remaining rows are not plainly "Fulfilled"

- **Stage 6** needs a person to rehearse the demonstration ([manual-verification.md](manual-verification.md)) and, if the course wants a slide file, to turn the outline into slides. Neither could be done here; the same flows pass in a scripted browser.
- **Stage 4** is fulfilled as the slide words it; the open point is our own login criterion and the fact that the data volume of the plans is small (36 vehicles).
- **Stage 2** lists no entity without the operations its rules allow; the exceptions are deliberate (an accounting trail and a booking history are not erased).

## RideDNA

RideDNA ([ridedna.md](ridedna.md)) is an extra feature that the course stages do not ask for. It changes none of the rows above: it adds two public pages (described in [pages.md](pages.md)), no table and no migration, and it reuses the booking, pricing and availability rules. Its tests are counted in the figures above, and it is not offered as evidence for any stage on its own.

## Commands that must keep passing

`npm run lint` · `npm test` · `npm run test:tz` · `npm run test:integration` · `./e2e/run.sh` · `./e2e/browser/run.sh` · `npm run db:check` (development database; the test database reports one intended failure, see [presentation.md](presentation.md)).
Load test: [../loadtests/README.md](../loadtests/README.md).
