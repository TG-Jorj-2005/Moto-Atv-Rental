#!/usr/bin/env bash
# Real-browser checks. Like ./e2e/run.sh it works ONLY on the test database: it empties and re-seeds it. Needs firefox, python3, psql.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . ./.env; set +a
: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is not set}"
case "$TEST_DATABASE_URL" in *_test\?*|*_test) ;; *) echo "REFUSED: TEST_DATABASE_URL must name a *_test database"; exit 1;; esac
[ "$TEST_DATABASE_URL" != "$DATABASE_URL" ] || { echo "REFUSED: test and development databases are the same"; exit 1; }
command -v firefox >/dev/null || { echo "firefox is not installed"; exit 1; }
PORT="${E2E_PORT:-3100}"; export BASE="http://localhost:$PORT" NEXT_DIST_DIR=".next-e2e" E2E_DB_URL="${TEST_DATABASE_URL%%\?*}"
export E2E_TMP="$(mktemp -d)"; trap 'kill ${SERVER:-0} 2>/dev/null || true; rm -rf "$E2E_TMP"' EXIT
fuser -k "$PORT/tcp" >/dev/null 2>&1 || true
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy >/dev/null
psql "$E2E_DB_URL" -q -c "truncate table users, vehicles, locations, customers, quote_requests cascade" 2>/dev/null
DATABASE_URL="$TEST_DATABASE_URL" SEED_DEMO_USERS=true DEMO_PASSWORD='Demo-pass-2030!' npx prisma db seed >/dev/null 2>&1
[ -n "${SKIP_BUILD:-}" ] && [ -d "$NEXT_DIST_DIR" ] || npx next build >"$E2E_TMP/build.log" 2>&1 || { tail -20 "$E2E_TMP/build.log"; exit 1; }
DATABASE_URL="$TEST_DATABASE_URL" UPLOAD_DIR="$E2E_TMP/uploads" AUTH_TRUST_HOST=true npx next start -p "$PORT" >"$E2E_TMP/server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/login" && break; sleep 0.5; done
fail=0
python3 -W ignore e2e/browser/flows.py || fail=1
python3 -W ignore e2e/browser/ridedna.py || fail=1
exit $fail
