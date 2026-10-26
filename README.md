# Moto & ATV Rental

University project (CTI, UGAL, BD2): a multi-vendor marketplace for renting ATVs and motorcycles. Private owners and
rental companies list vehicles, customers book them, and an administrator approves listings, hands vehicles over and
keeps the books. Payments and payouts are recorded by hand (no online payments).

| Role | What they do |
|---|---|
| Visitor | Browse the catalog (filters, availability by dates), vehicle pages with gallery, specifications, location, price and calendar |
| `CUSTOMER` | Book, see and cancel their own bookings before the start, edit profile and password |
| `OWNER` | Everything a customer does, plus list vehicles (photos, specifications), maintenance records, own calendar, bookings and earnings. Fixed 15% commission |
| `RENTAL_COMPANY` | Like an owner, plus bulk offers for many vehicles. Commission set per company by an admin (minimum 5%) |
| `ADMIN` | Statistics and alerts, listing moderation, vehicle status, booking handover/completion/cancellation, payments, payouts, users and roles, commission rates, reports and CSV export (all providers), locations |

The platform's own fleet has no owner and 0% commission. The demo fleet is 17 real models (cruisers, adventure, naked and sport, dual-sport, and ATVs) with manufacturer specifications and openly licensed photos credited on the page.

## Stack

Next.js 15 (App Router, server actions) · strict TypeScript · PostgreSQL 16 + Prisma · Auth.js (credentials, JWT carrying only the user id) · Zod · Tailwind CSS 4 with shadcn-style components (no Radix) · Vitest · Locust · Docker Compose

## Quick start with Docker (clean machine)

Needs Docker with Compose. Nothing else.

```bash
cp .env.example .env
# edit .env: set AUTH_SECRET (openssl rand -base64 32) and ADMIN_PASSWORD
docker compose up --build
```

Open http://localhost:3000 and log in as the administrator with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`
(default email `admin@example.com`). On start the container applies the migrations and, **only if the database has no
users yet**, seeds the administrator, 12 locations and 17 demonstration vehicles of the platform fleet. Restarting never resets data.
Uploaded photos live in the `uploads` volume. Use `DB_PORT` / `APP_PORT` to change the host ports.

## Local development

```bash
cp .env.example .env            # set AUTH_SECRET and ADMIN_PASSWORD
npm install
docker compose up -d db         # PostgreSQL on host port 5433
npx prisma migrate deploy       # never `migrate dev`: see "Migrations" below
npx prisma db seed              # admin + locations + platform fleet (safe to repeat)
npm run dev                     # http://localhost:3000 (or the next free port)
```

For a production build: `npm run build && AUTH_TRUST_HOST=true npm start`.

### Demo accounts (optional)

```bash
SEED_DEMO_USERS=true DEMO_PASSWORD='choose-a-password' npx prisma db seed
```

Adds `demo.customer@`, `demo.customer2@`, `demo.owner@` and `demo.company@example.com` with that password, their
vehicles, maintenance records and bookings in every status, a payout and an open offer. **All demo data is fictional**
(addresses are placeholders, phone `+40 000 000 000`, photos are public-domain images with credits on the page) and the
listings say so. Do not use it on a real deployment.

### Ports

| Service | Host port | Notes |
|---|---|---|
| PostgreSQL (Docker `db`) | **5433** | Mapped to 5432 in the container; host 5432 is left to a local PostgreSQL. |
| App | 3000 | Docker `app` talks to the database as `db:5432`. |

### Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Development/production database |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Used by the Docker `db` service |
| `AUTH_SECRET` | Signs sessions (required, keep it secret) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | First administrator created by the seed |
| `EUR_RON_RATE` | RON per 1 EUR for the currency switch and EUR payments |
| `UPLOAD_DIR` | Where vehicle photos are stored |
| `TEST_DATABASE_URL` | Tests only: a local database whose name ends with `_test` |
| `DB_PORT`, `APP_PORT` | Docker host ports |
| `SEED_DEMO_USERS`, `DEMO_PASSWORD` | Optional demo accounts (see above) |

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit tests (no database) |
| `npm run test:tz` | The unit tests under six machine time zones |
| `npm run test:integration` | Integration tests on a real PostgreSQL, **test database only** |
| `./e2e/run.sh` | End-to-end checks of the screens and actions over HTTP, test database only (see `e2e/README.md`) |
| `./e2e/browser/run.sh` | The main flows and the phone widths in a real headless Firefox (needs `firefox`), test database only |
| `npm run loadtest:seed` + Locust | Load scenarios (see `loadtests/README.md`) |
| `npm run db:check` | Read-only consistency report of the database in `DATABASE_URL` (21 checks: no overlaps, history, commission arithmetic, ...) |
| `npm run lint` | `tsc --noEmit` |
| `npm run build` | Production build |

## Migrations

All schema changes are SQL files in `prisma/migrations`, applied with `prisma migrate deploy`. Use `migrate diff` to
generate new ones and review them before applying. Do not use `migrate dev`: Prisma cannot model the exclusion
constraint and the partial indexes, so it reports false drift and would offer to reset the database. The only known
false positive in `migrate diff` is `ALTER COLUMN "period" DROP DEFAULT`, which is removed by hand.

## Documentation

- [docs/academic-requirements.md](docs/academic-requirements.md): checklist of the course stages 0 to 6 with evidence and status.
- [docs/domain.md](docs/domain.md) (domain, users, scenarios), [docs/database.md](docs/database.md) (tables, constraints, indexes, fixtures), [docs/pages.md](docs/pages.md) (pages and CRUD), [docs/performance.md](docs/performance.md) (plans and load test results), [docs/reports-and-export.md](docs/reports-and-export.md) (CSV export), [docs/presentation.md](docs/presentation.md) (demo script, outline, test results).
- [docs/manual-verification.md](docs/manual-verification.md): what a person should click through before the defence.
- [docs/business-rules.md](docs/business-rules.md): roles, authorization, vehicles and maintenance, booking lifecycle, commission and money, bulk offers, time zone rules, overlap prevention.
- [docs/architecture.md](docs/architecture.md): layers, ER diagram, use cases, class view, sequence and state diagrams.
- [decision.md](decision.md): the decisions, rules and constraints, with their origin, where they are implemented and how they were verified.
- [log.md](log.md): the owner's prompts and requirements in chronological order.
- [loadtests/README.md](loadtests/README.md) and [e2e/README.md](e2e/README.md).

## Project layout

```
prisma/          schema, migrations, seeds
src/app/         pages, server actions, API routes: (public) account provider admin api uploads
src/components/  ui (design system), layout, vehicle, booking and chart components
src/lib/         services (*-service.ts), pure rules, pricing, time zone, validators
src/test-support guarded test database helpers
scripts/         integration launcher, time-zone matrix, load-test seeding
e2e/  loadtests/ end-to-end checks and Locust scenarios
```

## Design decisions to know about

- **Overlap prevention is in the database.** A generated `tstzrange` column plus an exclusion constraint (`btree_gist`) rejects overlapping non-cancelled bookings, and a partial unique index allows one `ACTIVE` booking per vehicle. The service also locks rows in a fixed order so conflicts end as clean `409` answers, never as deadlocks.
- **Money is stored as integer bani and rates as integer basis points**, not as `Decimal` columns: exact, no floating point, simple half-up rounding in integer arithmetic. Only the exchange rate stored with an EUR payment is a decimal.
- **The role is read from the database on every request**; sessions carry only the user id.
- **Passwords use scrypt from `node:crypto`** (no extra dependency), which does not block the event loop like the pure-JavaScript bcrypt did; old bcrypt hashes keep working and are upgraded at login. Measurements: [docs/performance.md](docs/performance.md).

## Known limitations

- There is no password reset, and a database that served this version cannot be served by the older bcrypt-only code (the new hashes are not readable by it).
- Sessions are stateless JWTs: changing a password does not sign out other devices (the role and existence of the user are still checked on every request).
- Bulk offers are for `RENTAL_COMPANY` only. Customers see an informative note.
- No online payments, e-mail, PDF contracts, damages/deposits or audit log beyond the booking history.
- `next start` prints a warning about `output: "standalone"`; it works, and the Docker image uses it as is.
- The photos of the demo data repeat across vehicles; the demo vehicles are labelled as demonstration data.
- Pages are rendered on the server without per-page loading skeletons (only the catalog streams its results), so that unknown ids return a real 404.
- The load test and the end-to-end suite need a server on the test database; they never touch the development database.

## Contributors and development assistance

- **Author and owner:** TG-Jorj-2005 (student, CTI, UGAL). The author set the scope, the business rules and the decisions; see [decision.md](decision.md) and the record of requests in [log.md](log.md).
- **AI development assistance:** the implementation, tests and documentation were produced with the help of Anthropic's Claude, used through Claude Code, under the author's direction. The assistant is a tool, not a contributor account; commits are made with the author's own Git identity. Details: [docs/CONTRIBUTORS.md](docs/CONTRIBUTORS.md).
- Photos are credited on the site and in `src/lib/photo-credits.json`.

## Tests

- `npm test`: fast unit tests, no database needed.
- `npm run test:tz`: the same unit tests repeated under six different machine time zones (UTC, Bucharest, Los Angeles, Auckland, Kolkata, Lord Howe), to prove the date rules do not depend on the machine.
- `npm run test:integration`: tests that use a real PostgreSQL. They run **only** against `TEST_DATABASE_URL`. The launcher validates the target before creating, migrating or deleting anything, and refuses to run if the variable is missing, if the host is not local, if the database name does not end with `_test`, or if it is the same database as `DATABASE_URL`. The test process validates it again. The test database (default `rental_test`) is created automatically; the development database is never touched.

