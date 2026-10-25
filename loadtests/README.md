# Load tests (Locust)

Scenarios for the catalog and for authenticated bookings, including many users fighting for the same slot.
Run them against a server connected to the **test** database. Never point them at the development database.

```bash
# 1. Prepare the test database (validated: local, name ends with _test, different from DATABASE_URL)
npm run loadtest:seed          # prints LOAD_VEHICLE_IDS=...  (adds 200 users and 12 vehicles; safe to repeat)

# 2. Start the app on the test database (another port than the normal one)
npm run build
DATABASE_URL="$TEST_DATABASE_URL" AUTH_TRUST_HOST=true npx next start -p 3100

# 3. Run Locust (headless example: 50 users, 60 seconds)
python3 -m venv ~/.venvs/locust && ~/.venvs/locust/bin/pip install locust   # once
LOAD_VEHICLE_IDS=<ids printed above> ~/.venvs/locust/bin/locust -f loadtests/locustfile.py \
  --host http://localhost:3100 --headless -u 50 -r 10 -t 60s
```

Environment: `LOAD_VEHICLE_IDS` (required), `LOAD_USERS` (default 200), `LOAD_PASSWORD` (default `Load-test-2030!`).

What is checked: no unexpected status codes (409 conflict and 429 pending limit count as correct answers),
a start in the past or a foreign email gets 400, unknown pages get 404, and the contested slot is won by exactly one
booking. The process exits with code 1 if any check fails.
