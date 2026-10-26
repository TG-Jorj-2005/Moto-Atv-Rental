# Final presentation (Stage 6)

This is a structured outline for the defence of the project. It follows the stages listed in the course slide
(0 theme, 1 database, 2 CRUD and pages, 3 authentication and roles, 4 performance, 5 reports and export, 6 presentation).
No other requirement of the teacher is assumed. The slide order below is a suggestion, not a course rule.

## Preparing the demonstration (once, about 5 minutes)

```bash
cp .env.example .env                       # set AUTH_SECRET and ADMIN_PASSWORD; ADMIN_EMAIL defaults to admin@example.com
docker compose up -d db
npm install
npx prisma migrate deploy
SEED_DEMO_USERS=true DEMO_PASSWORD='choose-a-password' npx prisma db seed   # admin, 12 locations, 17 vehicles, demo users and activity
npm run build && AUTH_TRUST_HOST=true npm start                            # http://localhost:3000
```

Use a database that is **not** a real deployment: the demo users are fictional. (`docker compose up --build` with a clean `.env`
gives the administrator and the platform fleet without demo users.)

Accounts (the password is the one chosen above, the administrator's is `ADMIN_PASSWORD`):

| Role | E-mail |
|---|---|
| `ADMIN` | `ADMIN_EMAIL` from `.env` (default `admin@example.com`) |
| `CUSTOMER` | `demo.customer@example.com`, `demo.customer2@example.com` |
| `OWNER` | `demo.owner@example.com` |
| `RENTAL_COMPANY` | `demo.company@example.com` (commission 8%) |

## Demonstration order (about 15 minutes)

| # | Show | Say / prove |
|---|---|---|
| 1 | **Home** `/` | The domain and the idea: marketplace for ATVs and motorcycles ([domain.md](domain.md)); dark theme, responsive (shrink the window) |
| 2 | **Catalog** `/vehicles` | Filters by category, location, dates; only free vehicles for the chosen dates; pagination |
| 3 | **Vehicle page** | Gallery, specifications, calendar, exact price with the weekend rule |
| 4 | **Booking** as `demo.customer` | The `PENDING` booking, "My bookings" with the status history. Then open the **same slot in a second window** with `demo.customer2`: the answer is a clear conflict (database constraint). Try a start in the past and a foreign e-mail: refused |
| 5 | **Access control** | While signed in as the customer, open `/admin`: redirected to "forbidden". Signed out, open `/account`: redirected to login. Role is read from the database on every request |
| 6 | **Owner dashboard** `demo.owner` | Own vehicles and listing states, add a vehicle (CRUD: create, edit, photos, maintenance), own earnings; no data of the company is visible |
| 7 | **Company** `demo.company` | Bulk offer: request, see the partial offer, accept (all or nothing) |
| 8 | **Admin** | Moderate the pending listing; confirm → hand over → complete the booking from step 4; record a payment in EUR; the booking history shows each step and who made it |
| 9 | **Maintenance and status** | As the owner open a vehicle → *Maintenance*: add a record, press the pencil to **edit** it (the form is prefilled, an impossible deadline is refused), then delete. As the admin put a vehicle `IN_SERVICE`: it cannot be booked; `RETIRED` instead of delete |
| 10 | **Reports and export** | `/admin/finance`, then **Download CSV** (with a date range) and open it; as the owner download only the own file ([reports-and-export.md](reports-and-export.md)) |
| 10b | **RideDNA** `/ridedna` | Seven questions, a rider profile, three real vehicles with the reasons, the choice of a day (availability and exact price), *Choose this vehicle* opening the normal booking with the period filled in ([ridedna.md](ridedna.md)) |
| 11 | **Integrity** | `npm run db:check` (21 checks); the exclusion constraint and the indexes in [database.md](database.md) |
| 12 | **Performance** | The Locust results in [performance.md](performance.md); how the contested slot ends with one winner |

## Slide outline (suggestion)

1. Title, author, course. 2. Domain and problem (Stage 0). 3. Roles and scenarios. 4. Architecture and stack.
5. ER diagram and the 12 tables (Stage 1). 6. Integrity: exclusion constraint, partial indexes, snapshots. 7. Pages and CRUD (Stage 2).
8. Authentication, four roles, server-side authorization (Stage 3). 9. Booking lifecycle and concurrency. 10. Commission and money.
11. Indexes, plans and load test (Stage 4). 12. Reports and CSV export (Stage 5). 13. Tests and results. 14. Limitations and future work. 15. Live demonstration.

## Tests run on 2026-10-26 (real results of the final tree)

| Check | Command | Result |
|---|---|---|
| Type check | `npm run lint` (`tsc --noEmit`) | no errors |
| Unit tests | `npm test` | 251 passed (26 files) |
| Unit tests in six time zones | `npm run test:tz` | 251 passed in each of the 6 zones |
| Integration tests on PostgreSQL (test database; include concurrent bookings, roles and offers, the password upgrade and the CSV boundaries) | `npm run test:integration` | 151 passed (16 files) |
| End to end over HTTP (builds the app, test database) | `./e2e/run.sh` | 434 checks passed (376 + 25 of RideDNA + 33 of photos at creation) + the seed idempotency check, 0 failures |
| **Real browser** (headless Firefox through Marionette, test database) | `./e2e/browser/run.sh` | 107 checks passed, 0 failures (63 of the main flows, 13 of them for the photos, + 44 of RideDNA; see below) |
| Consistency of the development database | `npm run db:check` | 21 of 21 passed |
| All 13 migrations on a fresh empty database | `prisma migrate deploy` on a new `*_test` database (dropped afterwards) | applied; 12 tables; the overlap and partial-index constraints present; `migrate diff` shows only the known false positive |
| **Docker Compose** with the documented configuration | `docker compose up --build -d app` | image built in 72 s; the app started, applied no migration (database up to date), skipped the seed (users exist); `/login`, `/vehicles`, `/api/vehicles` answer 200, `/admin` redirects; the placeholder `AUTH_SECRET` and `ADMIN_PASSWORD` make the container refuse to start; scrypt works in the container (Node 22). Volumes and the development database were not touched |
| Load test, mixed, 50 and 100 users, 60 s | Locust | 3731 and 4715 requests, 0 failures, one winner per contested slot, no overlaps afterwards |
| Load test, login alone, 1, 10 and 50 users, 30 s | Locust `LoginOnly` | login median 360 ms, 690 ms and 5.5 s (before the hashing change: 830 ms, 8.1 s and no login completed); details in [performance.md](performance.md) |

`npm run db:check` on the **test** database reports one failure that is intended: an end-to-end script writes a 3% rate on a
company to prove that the application never uses a rate below 5%.

## What was checked in a browser

**A real browser was used**, but not an interactive one. The machine has Firefox and no browser-automation package, so `e2e/browser/marionette.py` (about 65 lines, standard library only)
drives a headless Firefox through its Marionette protocol: real navigation, real clicks and keystrokes, the real downloads folder. It is automation, not a person: nobody looked at the
screen during these runs, and values of date fields are set by script (a script cannot type into a `datetime-local` field the way a person does).

`./e2e/browser/run.sh` (empties and re-seeds the **test** database, builds, starts the app, runs `e2e/browser/flows.py`) checked, with 50 passing checks:

| Area | Checked |
|---|---|
| Public | the *ATVs* link, category chips (only ATV categories under an ATV filter, all six otherwise; a chip filters the list), the search form, an empty search, the 404 page, `/account` redirects a visitor to the login |
| Login | a wrong password stays on the login page with a message; the right one shows the user's name; a customer opening `/admin` gets *Access denied* |
| Booking | typing a period shows a price; sending creates a `PENDING` booking at the Bucharest time typed and opens it with *Booking requested*; an overlapping period is refused with a message and creates no second booking; the customer cancels it |
| Maintenance (owner) | add a record, open the edit form from the pencil (prefilled), a deadline before the date done is refused with a message and nothing changes, a valid edit changes the same row and shows the notice |
| CSV (admin and owner) | the download button saves the file; BOM, header and row counts equal the database; an empty range gives only the header; the owner's file has only the owner's rows |
| Phone width | 25 pages of the three roles at 390 px (measured in an iframe of that width, because the window cannot be narrower than 500 px): none scrolls sideways |

Fixed because of this run: four admin pages and the owner's maintenance tab were 411 to 916 px wide on a phone (the `sr-only` header label of the last table column was positioned
outside the scrolling area of the table); the period buttons of *Finance* did not wrap; an ATV filter offered the *Cruiser* chip.

**Not verified in a browser:** how the pages look and feel to a person (earlier screenshots in [screenshots/](screenshots/) were looked at, nothing more), the mobile menu, keyboard use,
Chrome and Safari, a real phone, opening the CSV in a spreadsheet, the Docker image in a browser (only `curl`). The steps for a person are in [manual-verification.md](manual-verification.md).

## Known limitations

- No online payments, e-mail, PDF contracts, damages or deposits, refunds, password reset; no audit log beyond the booking history.
- Export is CSV only (no PDF or Excel).
- Locations cannot be deleted and payments and payouts cannot be edited (accounting entries); see [pages.md](pages.md).
- Sessions are stateless JWTs: changing a password does not sign out other devices. With 50 users logging in without pause the login median is still 5.5 s on one process (2.2 s with `UV_THREADPOOL_SIZE=16`, measured twice and deliberately not set by default); see [performance.md](performance.md).
- The load test ran on one machine with one Node process; larger data volumes were not measured. Under 100 users pages are limited by server-side rendering on that single process.
- The password hashes moved from bcrypt to scrypt: the bcrypt-only code cannot log in an account whose hash was upgraded (it answers "wrong password"; nothing is lost), and there is no password reset. Never run the old version against a database that served the new one ([performance.md](performance.md#rollback-what-happens-if-the-bcrypt-only-code-is-deployed-again)).
- No interactive browser was available: the flows run in a scripted headless Firefox; the manual list is in [manual-verification.md](manual-verification.md).
- Photos of demonstration vehicles repeat; they are labelled as demonstration data.
