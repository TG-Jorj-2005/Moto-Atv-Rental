# End-to-end checks

Python scripts that drive the running application over HTTP the way a browser does: they log in, read the HTML,
submit the real forms and server actions (including photo uploads) and then check both the page and the database.

```bash
./e2e/run.sh        # needs python3, curl, psql, and TEST_DATABASE_URL in .env
```

The runner refuses to start unless `TEST_DATABASE_URL` is a `*_test` database different from `DATABASE_URL`. It
**empties and re-seeds the test database** before each script, builds the app into `.next-e2e` (your normal `.next`
folder and any running server are untouched), starts it on port 3101 (`E2E_PORT` to change) with a temporary upload
folder, and exits with code 1 if any check fails.

| Script | Covers |
|---|---|
| `public_and_customer.py` | catalog filters, categories and search words, vehicle page with category and photo credit, price API, 404s, profile, password, booking detail privacy, customer cancel |
| `accounts.py` | scrypt storage and the upgrade of a legacy bcrypt hash at login, registration (ADMIN can never be chosen, invented roles, duplicates, weak passwords), login, forged and garbage sessions, role and deletion read from the database on every request |
| `owner.py` | creating listings (category must fit the type), photo upload rules and serving, path traversal, edits and re-approval, maintenance, other owners' vehicles, earnings |
| `company_and_admin.py` | bulk offers (stale, changed, accepted), handover, completion, payments in EUR, cancellation, vehicle status rules, moderation, roles, commission rate, payouts, locations, CSV |
| `booking_api.py` | `POST /api/bookings`: 401, email mismatch, past start, conflict (409), pending limit; 8 simultaneous requests from one user (exactly 3 succeed); 6 users on one slot (exactly 1 wins) |
| `authorization.py` | every route by role, forged admin actions from every other role, isolation between owners and companies, the status API |
| `crawl.py` | follows every internal link and image for each role (no broken link), seeded photos are served and credited, the six categories and 17 models exist |
| `robustness.py` | malformed and hostile requests (NUL bytes, huge values, SQL-looking text, bad JSON) never give a 5xx or leak internals; security headers |
| `finance.py` | commission snapshot and half-up rounding per role, handover and completion, RON and EUR payments, balances, payouts, dashboards equal to the database, CSV formula neutralization |
| `maintenance.py` | ITP/RCA/service warnings, in-service vehicles cannot be booked or handed over, only the admin returns them, RENTED derived |

`E2E_ONLY="finance maintenance" ./e2e/run.sh` runs only some scripts. Before the scripts, the runner checks that running the seed again adds no rows.

## Real browser (`e2e/browser/`)

`./e2e/browser/run.sh` does what the scripts above cannot: it drives a headless **Firefox** (through its Marionette protocol,
`marionette.py`, standard library only), so the pages' own JavaScript runs. It checks the catalog filters, login, a booking with a
conflict, the maintenance edit form, the CSV downloads of the admin and an owner, and that 25 pages fit in 390 px.
Needs `firefox` on the PATH; like `run.sh` it empties and re-seeds the test database only. `SKIP_BUILD=1` reuses the last `.next-e2e` build.
Values typed before React hydrates a form are erased, so the script waits after each page load; a person never types that fast.
