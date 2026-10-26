# Performance (Stage 4)

Measured on 2026-10-26 on the author's machine (Linux, 20 logical CPUs, Node 26, PostgreSQL 16 in Docker on the same
machine), with the production build (`next build` + `next start`, **one Node process**) against the **test** database
(`rental_test`: 36 vehicles, 200 load-test users, a few hundred bookings). Absolute times depend on the machine; the runs
below are comparable with each other because they used the same machine, data, scenarios and commands.
The course gives no performance thresholds; the criteria at the end are our own.

## Indexes and query plans

Indexes and the queries they serve: [database.md](database.md#indexes). `EXPLAIN ANALYZE` on the test database:

| Query | Plan | Time |
|---|---|---|
| Bookings of a vehicle overlapping a period | Index Scan on `booking_no_overlap` (the exclusion constraint's GiST index) | 0.9 ms |
| Catalog: approved, available vehicles of a category | Index Scan on `vehicles_category_idx`, then filter | 0.09 ms |
| Catalog page: approved vehicles ordered by name, 12 rows | sort of 36 rows, top-N | 0.12 ms |
| Bookings of one user, newest first | Bitmap Index Scan on `bookings_user_id_status_idx`, sort | 0.17 ms |

The tables are small, so these plans prove that the indexes are usable and chosen where the predicates match, not how the queries
behave at a million rows (not measured). Application side: the catalog is paginated, provider lists are capped at 50 rows, the CSV at
5000 rows; related rows are loaded with `select` / `include` in one query (no per-row queries).

## Investigation of the slow login

The first load test (earlier on 2026-10-26, hashes at bcrypt cost 10) showed the login as the slowest request. With the hashes at
bcrypt cost 12, which is what the application stores in production, it was far worse:

| Measurement | Result |
|---|---|
| One `bcryptjs.compareSync` at cost 12 (micro-benchmark) | 483 ms of CPU |
| 8 simultaneous `bcryptjs.compare` calls (async API) | 3.9 s in total, and the event loop was **blocked for up to 808 ms** in one piece |
| The same with 8 `crypto.scrypt` calls (N=2^15, r=8, p=1) | 0.33 s in total, longest event-loop stall 6 ms |
| Login alone, 1 user, through HTTP | 830 ms median |
| Login alone, 10 users in parallel | 8.1 s median; even the trivial `GET /api/auth/csrf` took 210 ms |
| Login alone, 50 users in parallel, 30 s | **not one login completed**; `GET /api/auth/csrf` had a median of 14 s |

Cause: `bcryptjs` is pure JavaScript. Its work runs on the one thread that also serves every page, so a burst of logins queues
behind each other and stops all other requests. It is **not** the database (queries take far below a millisecond), nor the network.

## The change: scrypt from `node:crypto`

Decision and checks (code: `src/lib/password.ts`, tests: `src/lib/password.test.ts`, `e2e/accounts.py`):

| Question | Answer |
|---|---|
| Why not lower the bcrypt cost? | That would weaken the hashes; it was not done. |
| Why not the `bcrypt` or `argon2` packages? | They need a native build and are a new dependency. `node:crypto` already has scrypt, runs it on the libuv thread pool and adds no dependency. |
| Strength | scrypt N=2^15, r=8, p=3 (32 MiB of memory): one of the equivalent settings in the OWASP Password Storage Cheat Sheet. Its CPU time (about 0.35 s per hash) is of the same order as bcrypt cost 12 (about 0.5 s) and, unlike bcrypt, it needs memory, which makes parallel guessing on GPUs more expensive. It is not weaker; it is also not provably stronger. |
| Existing passwords | Still valid. The stored format tells the algorithm: `$2a$...` is bcrypt, `scrypt$N$r$p$salt$hash` is scrypt. A user with a bcrypt hash logs in normally and the hash is replaced by a scrypt one right after the successful login (`UPDATE ... WHERE id AND password_hash = old`, so a password changed meanwhile is never overwritten). No bulk migration, no downtime. Accounts that never log in keep their bcrypt hash. |
| Comparison | `timingSafeEqual`; malformed stored values are a failed login, never an exception; passwords are Unicode-normalized (NFKC) for scrypt hashes. |
| Unknown e-mail | Now costs the same time as a wrong password (a dummy verification), so the response time does not reveal which accounts exist. |
| Places changed | login (`src/auth.ts`), registration, change of password, the seeds and the load-test seed. |
| **Risk: rollback** | See "Rollback" below. |
| Tests | 9 unit tests (round trip, salts, legacy bcrypt, an external bcrypt test vector, weaker parameters, malformed values, Unicode, and what the old code does with a new hash), 3 integration tests of the upgrade (a wrong password leaves the hash alone; 8 simultaneous logins of one account all succeed and end with one valid scrypt hash; a password changed meanwhile is never overwritten), 4 end-to-end checks (legacy login works, wrong password leaves the old hash, upgrade to scrypt, upgraded hash works), the integration test of the change of password. One assertion of `profile-service.int.test.ts` was changed because it checked the storage format (`bcrypt.compare` on the new hash); it now checks `scrypt$` and `verifyPassword`. |

## Rollback: what happens if the bcrypt-only code is deployed again

Audited with `src/lib/password.test.ts` (`compatibility with the bcrypt-only code`):

| Account | With the old code |
|---|---|
| Never logged in since the change, registered earlier (hash `$2a$...`) | Works: the hash was not touched. |
| Logged in since the change (hash upgraded to `scrypt$...`), or registered or changed its password since | **Cannot log in.** `bcryptjs.compare(password, "scrypt$...")` returns `false` (it neither throws nor corrupts anything), so the answer is the usual "wrong password". Changing the password from the profile fails the same way (`WRONG_PASSWORD`). |
| Data | Nothing is lost or damaged; the hashes stay as they are. Rolling forward again restores access immediately. |
| Fix without rolling forward | Not available in the application: there is no password reset. An administrator would have to write new hashes into the database by hand. |

The rule that follows: **do not run the old version against a database that has been served by the new one.** The compare-and-set update is safe against
concurrent logins (tested), but it is also what makes the change one-way. A two-phase release would remove the risk (first deploy code that can *read*
scrypt but still *writes* bcrypt, later switch the writing); this was **not implemented** because it needs a configuration switch in the hashing code and
the project has no deployment that needs it. It is the recommended step if the application ever runs for real users.

## Results before and after

Commands (same for both): see [../loadtests/README.md](../loadtests/README.md). Login alone: `locust ... -u <1|10|50> -r 50 -t 30s LoginOnly`.
Mixed: `locust ... -u <50|100> -r 10 -t 60s Visitor Customer SlotFighter`. Server: `next start`, one process, test database, 200 load users.
**Before** = the code of commit `678810d` with the load users stored as bcrypt cost 12. **After** = the final code with scrypt hashes.
Raw statistics: [load-results/](load-results/) (`before-*`, `final-*`, `pool16-*`, `pool-*`).

### Login alone (30 s)

| Users | | Logins done | Failures | Login median | p95 | p99 | Longest |
|---|---|---|---|---|---|---|---|
| 1 | before | 16 | 0 | 830 ms | 1.0 s | 1.0 s | 1.0 s |
| 1 | after | 20 | 0 | 360 ms | 420 ms | 420 ms | 0.4 s |
| 10 | before | 30 | 0 | 8.1 s | 8.8 s | 8.8 s | 8.8 s |
| 10 | after | 157 | 0 | 690 ms | 1.2 s | 1.3 s | 1.3 s |
| 50 | before | **0** (only 35 `csrf` answers, median 14 s) | – | – | – | – | – |
| 50 | after | 200 | 0 | 5.5 s | 6.1 s | 6.2 s | 6.2 s |
| 50 | after, `UV_THREADPOOL_SIZE=16` | 400 | 0 | 2.2 s | 2.9 s | 2.9 s | 3.0 s |

With 50 users that log in again and again without pause, the CPU is the limit: libuv has 4 threads by default and each hash takes about 0.35 s
(at most about 11 logins per second in theory; about 7 were measured). Setting the environment variable `UV_THREADPOOL_SIZE=16` doubled the throughput. It is a configuration
of the process, not a code change; it was measured but **not** added to the Dockerfile or `docker-compose.yml`.

### Mixed scenarios (60 s; 10 new users per second; visitors, customers, one booking fight per slot)

| Users | | Requests | Failures | Req/s | Median | p95 | p99 | Longest |
|---|---|---|---|---|---|---|---|---|
| 50 | before | 2881 | 0 | 49 | 67 ms | 320 ms | 10 s | 14.4 s |
| 50 | after | 3731 | 0 | 63 | 48 ms | 210 ms | 950 ms | 3.9 s |
| 100 | before | 1590 | 0 | 27 | 610 ms | 23 s | 35 s | 39 s |
| 100 | after | 4715 | 0 | 80 | 350 ms | 990 ms | 1.6 s | 3.1 s |

Selected requests (median / p95), before → after:

| Request | 50 users | 100 users |
|---|---|---|
| Catalog `GET /vehicles?filters` | 120 / 380 ms → 81 / 270 ms | 1.0 s / 32 s → 710 ms / 1.2 s |
| Vehicle page `GET /vehicles/[id]` | 100 / 350 ms → 65 / 240 ms | 870 ms / 3.6 s → 540 / 980 ms |
| `GET /api/vehicles/[id]/price` | 16 / 43 ms → 12 / 35 ms | 54 ms / 5.3 s → 32 / 68 ms |
| `POST /api/bookings` | 52 / 210 ms → 41 / 110 ms | 320 / 730 ms → 190 / 460 ms |
| `POST /api/bookings`, contested slot | 50 / 190 ms → 38 / 100 ms | 310 / 900 ms → 220 / 500 ms |
| Login in the mixed run (25 and 50 logins in the ramp-up) | 8.8 s / 14 s → 1.4 / 2.5 s | 24 s / 39 s → 1.1 / 2.6 s |

Correctness under the load, in all runs: 0 failed requests, **exactly one** successful booking for every contested slot, and no two
non-cancelled bookings of a vehicle overlap in the database (checked with SQL after the runs).

### Is `UV_THREADPOOL_SIZE=16` justified?

Measured twice for each setting on the final build (same machine, data and commands; server restarted each time), 50 users logging in
without pause for 30 s, and the mixed scenario with 100 users for 60 s:

| | Logins done (50 users, 30 s) | Login median / p95 | Mixed 100: requests (req/s) | Median | p95 | p99 | Catalog median / p95 |
|---|---|---|---|---|---|---|---|
| default (4 threads), run 1 | 200 | 5.0 s / 6.4 s | 4773 (81) | 320 ms | 1.00 s | 1.8 s | 700 / 1300 ms |
| default, run 2 | 200 | 5.6 s / 6.2 s | 4846 (82) | 320 ms | 0.97 s | 1.7 s | 680 / 1100 ms |
| 16 threads, run 1 | 400 | 2.3 s / 2.8 s | 5100 (86) | 280 ms | 0.86 s | 1.0 s | 620 / 970 ms |
| 16 threads, run 2 | 400 | 2.2 s / 2.9 s | 5026 (85) | 290 ms | 0.88 s | 1.1 s | 620 / 1000 ms |

Both runs of each setting agree, so the difference is not noise: a login burst is served twice as fast and the 99th percentile of the mixed run drops from about 1.75 s to
about 1.05 s, with about 5% more throughput. **But** the setting only helps when there are spare cores (this machine has 20; on a container with 2 cores it would not),
each concurrent hash can use 32 MiB (16 threads: up to 512 MiB at the peak), and the benefit shows only in login bursts, which a real site rarely has
(50 users logging in again and again without pause is a stress test, not a usage pattern). **Decision: not added** to the Dockerfile or `docker-compose.yml`. Set it
(`UV_THREADPOOL_SIZE=16` in the `app` service environment) only on a host with enough cores and memory that expects many simultaneous logins. Raw statistics: `load-results/pool-*`.

### RideDNA

The results page of the RideDNA feature ([ridedna.md](ridedna.md)) reads at most 300 vehicles and, with a chosen day, one booking query. Unloaded it answers in about 29 ms (the catalog: 31 ms). In the mixed
scenario with the page in the visitors' tasks (`load-results/ridedna-mixed-*`, final build, one process): 50 users, 3661 requests, 0 failures, results page median 87 ms and 95th percentile 380 ms; 100 users, 4885 requests, 0 failures, median 540 ms and 95th
percentile 820 ms (the catalog in the same run: 610 ms and 1.1 s). It adds no index and no table.

### What is left

With 100 users the pages are CPU-bound in server-side rendering: one unloaded request takes about 30 to 45 ms of CPU in the single Node process
(`/`: 43 ms, `/vehicles`: 35 ms; the database part is about 0.1 ms), which caps one process at roughly 25 to 30 pages per second.
The step from 50 to 100 users therefore raises the page latencies (median 0.5 to 0.7 s). More processes behind a balancer would be the next step; it was not measured here.
Not measured: larger data volumes, several Node processes, the Docker image under load.

### Internal criteria (ours, not from the course)

| Criterion | 50 users (after) | 100 users (after) |
|---|---|---|
| No failed or unexpected requests | met | met |
| Exactly one winner per contested slot, no overlaps in the database | met | met |
| 95th percentile of the whole run under 2 s | met (210 ms) | met (990 ms) |
| 99th percentile of the whole run under 2 s | met (950 ms) | met (1.6 s) |
| Login median under 1 s with 10 simultaneous users | met (690 ms) | |
| Login median under 3 s with 50 users logging in without pause | not met (5.5 s; met with `UV_THREADPOOL_SIZE=16`: 2.2 s) | |

Before the change the 99th-percentile criterion was not met in either run (10 s and 35 s).
