#!/usr/bin/env bash
# End-to-end checks of the screens and actions, driven over HTTP like a browser (forms, server actions, uploads).
# Runs ONLY against the TEST database: it empties and re-seeds it. Needs: python3, psql, curl, a built app (npm run build).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is not set}"
case "$TEST_DATABASE_URL" in *_test\?*|*_test) ;; *) echo "REFUSED: TEST_DATABASE_URL must name a *_test database"; exit 1;; esac
[ "$TEST_DATABASE_URL" != "$DATABASE_URL" ] || { echo "REFUSED: test and development databases are the same"; exit 1; }
PORT="${E2E_PORT:-3100}"
WORK="$(mktemp -d)"; trap 'kill ${SERVER:-0} 2>/dev/null || true; [ -n "${E2E_KEEP:-}" ] || rm -rf "$WORK"' EXIT
export NEXT_DIST_DIR=".next-e2e"
export E2E_TMP="$WORK" E2E_UPLOAD_DIR="$WORK/uploads" BASE="http://localhost:$PORT"
export E2E_DB_URL="${TEST_DATABASE_URL%%\?*}"
mkdir -p "$E2E_UPLOAD_DIR"
echo "this is not an image" > "$WORK/fake.jpg"
head -c 6000000 /dev/zero | tr '\0' 'A' > "$WORK/big.jpg"
reseed() {
  DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy >/dev/null
  psql "$E2E_DB_URL" -q -c "truncate table users, vehicles, locations, customers, quote_requests cascade"
  DATABASE_URL="$TEST_DATABASE_URL" SEED_DEMO_USERS=true DEMO_PASSWORD='Demo-pass-2030!' npx prisma db seed >/dev/null
}
fail=0
reseed
echo "== seed is idempotent"
counts() { psql "$E2E_DB_URL" -Atc "select (select count(*) from users)||'/'||(select count(*) from vehicles)||'/'||(select count(*) from vehicle_photos)||'/'||(select count(*) from locations)||'/'||(select count(*) from maintenance)"; }
before="$(counts)"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma db seed >/dev/null
DATABASE_URL="$TEST_DATABASE_URL" npx prisma db seed >/dev/null
after="$(counts)"
# the second and third runs use the base seed only (no demo users), so the totals must not change
if [ "$before" = "$after" ]; then echo "  PASS  re-running the seed twice adds no users, vehicles, photos or locations ($after)"; else echo "  FAIL  seed changed the data: $before -> $after"; fail=1; fi
echo "building into $NEXT_DIST_DIR (the normal .next folder is left alone)"
npx next build >"$WORK/build.log" 2>&1 || { tail -20 "$WORK/build.log"; exit 1; }
DATABASE_URL="$TEST_DATABASE_URL" UPLOAD_DIR="$E2E_UPLOAD_DIR" AUTH_TRUST_HOST=true npx next start -p "$PORT" >"$WORK/server.log" 2>&1 &
SERVER=$!
for _ in $(seq 1 40); do curl -s -o /dev/null "$BASE/login" && break; sleep 0.5; done
for script in ${E2E_ONLY:-public_and_customer accounts owner company_and_admin booking_api authorization crawl robustness finance maintenance ridedna}; do
  reseed
  echo "== $script"
  out="$(python3 -W ignore "e2e/$script.py" 2>&1)" || true
  echo "$out" | grep -E "^  FAIL|Traceback" || true
  echo "$out" | grep -c "PASS" | sed 's/^/   passed checks: /'
  echo "$out" | grep -qE "^  FAIL|Traceback" && fail=1
done
exit $fail
