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
| `public_and_customer.py` | catalog filters, vehicle page, price API, 404s, profile, password, booking detail privacy, customer cancel |
| `owner.py` | creating listings, validation, photo upload rules and serving, path traversal, edits and re-approval, maintenance, other owners' vehicles, earnings |
| `company_and_admin.py` | bulk offers (stale, changed, accepted), handover, completion, payments in EUR, cancellation, vehicle status rules, moderation, roles, commission rate, payouts, locations, CSV |
| `booking_api.py` | `POST /api/bookings`: 401, email mismatch, past start, conflict (409), pending limit |
| `authorization.py` | every route by role, forged admin actions from every other role, isolation between owners and companies, the status API |
