# RideDNA: personalised recommendations

RideDNA is an **extra feature** of the project (it is not one of the course stages). A visitor answers seven short questions, gets a rider profile and up to three
real vehicles of the fleet, sees which of them are free on chosen dates and what the trip costs, and continues to the normal booking.
It is built from fixed rules: there is no artificial intelligence, no external service and no randomness, and no data is stored.

Screenshots (synthetic demo data, taken in a scripted browser): [results](screenshots/ridedna-results-desktop.png), [questionnaire on a phone](screenshots/ridedna-quiz-mobile.png), [no match](screenshots/ridedna-no-match-desktop.png).

## 1. User flow

| Step | Page | What happens |
|---|---|---|
| 1 | `/ridedna` | Introduction and the questionnaire (7 steps with a progress bar, *Back*, *Continue*, *Start over*) |
| 2 | `/ridedna` (last step) | Summary with the rider profile, every answer with a *Change* button, and a confirmation that the result is a suggestion |
| 3 | `/ridedna/results?...` | Profile, up to three recommendations with the reasons, a side-by-side table, a form for the first day and the length |
| 4 | the same page | With a day: only vehicles free for the whole period, exact price. *Choose this vehicle* opens the vehicle page with the period filled in |
| 5 | `/vehicles/[id]?start=...&end=...#book` | The normal booking form (login if needed, the day travels with the login link) |

No account is needed up to step 4. The answers live in the web address of the results page (so a result can be shared and the browser's Back button works) and, for an
unfinished questionnaire, in the `sessionStorage` of the tab (cleared by *Start over* and when the tab closes). **Nothing is written to the database** and there is no migration.

## 2. The questions and what each one does

| Question | Options | Effect |
|---|---|---|
| Experience | beginner, intermediate, advanced | eligibility (power limits) and the experience criterion |
| Licence | none, A2, A | eligibility (motorcycles only) |
| Kind of ride | paved touring, forest roads and mixed terrain, off-road trails, recreational ATV | eligibility and the biggest criterion (category fit) |
| Priorities (one or two) | comfort, easy handling, power, exploring far, sporty feel, simplicity | the preferences criterion |
| Trip | length (a few hours, a day, a weekend, 3 days, a week), alone or with a passenger, an optional first day | the period of the price; seats; availability |
| Budget | whole amount for the whole trip, in the currency of the page (RON or EUR, converted with `EUR_RON_RATE`) | hard limit and the budget criterion |
| Confirmation | a checkbox | the result is a suggestion, no licence or skill is verified |

Questions about luggage and similar were **not** added: the vehicle table has no field that could answer them.

## 3. Rider profile (`src/lib/ridedna/profile.ts`)

The first matching rule wins (the order is part of the behaviour and is tested):

| # | Rule | Profile |
|---|---|---|
| 1 | ATV ride, beginner | First-Trail Quad Rider |
| 2 | ATV ride | Quad Explorer |
| 3 | off-road trails, not a beginner | Off-road Pioneer |
| 4 | off-road trails | Trail Starter |
| 5 | mixed terrain, "exploring far" chosen, 3 days or more | Mountain Explorer |
| 6 | mixed terrain | Trail Seeker |
| 7 | paved roads and sport or power chosen | Spirited Roadster |
| 8 | paved roads, 3 days or more | Touring Adventurer |
| 9 | paved roads and comfort or simplicity chosen | Comfort Rider |
| 10 | paved roads, a weekend or less | Weekend Explorer |
| 11 | anything else | Road Explorer |

The profile also lists the answers as chips and general reminders (helmet, check the licence rules, beginner and off-road advice). It states that it is **not** an assessment of riding skills.

## 4. Eligibility (hard rules, `eligibilityReasons`)

A vehicle that fails any rule is never recommended, whatever its score would be. Every failed rule is recorded (the empty-result page uses the counts).

| Rule | Excluded when |
|---|---|
| Category | the category is not recorded, or it is not meant for the chosen ride (fit 0 in the table below) |
| Licence (motorcycles) | the user holds no licence; the vehicle needs a higher category (A2 < A); the needed category is not recorded and the user holds A2 (only A covers an unrecorded requirement) |
| Power | beginner: more than 100 hp, or power not recorded; intermediate: more than 130 hp. These limits are our own guidance, not a legal or an insurer's rule |
| Passenger | two riders and the vehicle is not recorded with at least 2 seats |
| Budget | the price of the period is above the budget (to the bani) |
| Dates (when a day was chosen) | the vehicle has a non-cancelled booking overlapping the period (half-open periods: back-to-back is free) |
| Listing | only approved vehicles that are not in service and not retired are considered; the signed-in user's own vehicles are left out |

The statuses of vehicles and bookings are not changed by RideDNA.

## 5. Score (0 to 100, `evaluateVehicle`)

| Criterion | Weight | Fit (0 to 1) comes from |
|---|---|---|
| Kind of ride | 40 | `ADVENTURE_FIT[category][ride]` |
| Priorities | 30 | the average of the chosen priorities: style priorities (comfort, handling, exploring, sporty) from `CATEGORY_TRAITS[category]`; *power* = horsepower / 120 (at most 1); *simplicity* from horsepower (50 hp or less: 1, up to 75: 0.8, up to 100: 0.5, above: 0.25) |
| Experience | 15 | power level (low up to 50 hp, medium up to 100, high above) against experience |
| Budget | 15 | price / budget: up to 0.5 gives 1, then falling linearly to 0.4 at 1.0 |

The score is the weighted average of the criteria that **can be judged**, rounded to a whole number. A criterion whose data is missing (for example no horsepower stored) is left out, the
others are rescaled, and the card says what could not be judged. A missing value is never treated as a good one. Labels: 85 or more *Excellent*, 70 *Good*, 50 *Fair*, otherwise *Possible match*.
Ties are ordered by the lower price, then the name, then the id, so the order never changes between two runs.

Category fit (editorial judgement from the category descriptions; 0 = not intended for that use):

| Category | Paved touring | Mixed terrain | Off-road | ATV ride |
|---|---|---|---|---|
| Cruiser | 0.9 | 0 | 0 | 0 |
| Adventure & touring | 1 | 1 | 0.6 | 0 |
| Naked & sport | 0.8 | 0 | 0 | 0 |
| Dual-sport & enduro | 0.4 | 0.9 | 1 | 0 |
| Sport ATV | 0 | 0.5 | 0.8 | 1 |
| Utility ATV | 0 | 0.6 | 0.9 | 1 |

The category character table (comfort, handling, exploring, sporty) is in `CATEGORY_TRAITS`. Both tables are opinions, written down so that they can be read, tested and changed; they are not measurements.

## 6. Data, availability and price

- **Vehicles:** one query on `vehicles` (approved, available, at most 300, ordered by id) with the specification columns, the location and the cover photo. The existing indexes `(listing_status, status)` are used. Specifications are used as stored: nothing is deduced from a name.
- **Availability:** only when a day is chosen. One query on `bookings` for all candidates (non-cancelled, overlapping the period), the same rule as the price preview and the database exclusion constraint. Without a day, nothing is claimed about availability.
- **Price:** the function `calculatePrice` of the booking itself, in whole bani. With a day: the exact period (09:00 Bucharest time, the chosen length, as instants, so clock changes are handled by the existing time-zone code). Without a day: an estimate for a weekday period of that length (a fixed reference Tuesday in June, away from clock changes). Standard rates apply; the weekend flat rate only applies when the rental fits between Saturday 00:00 and Monday 00:00, which a 09:00 start of 24 or 48 hours does not (the booking page lets the user change the end time).
- **Currency:** amounts are shown in the currency chosen on the page; the budget is converted to RON with `EUR_RON_RATE`.

## 7. Hand-over to the booking

*Choose this vehicle* is a link to `/vehicles/[id]?start=...&end=...#book` (local times in the form's format). The vehicle page accepts the pair only if both match `YYYY-MM-DDTHH:mm`, fills the form with it and ignores anything else.
**The booking is not shortcut:** the form asks the server for the price and the availability, and `POST /api/bookings` repeats every check (login, role, own vehicle, e-mail, start in the future, PENDING limit,
vehicle status, overlap constraint) and recomputes the price from the stored rates. Prices, scores, availability and roles in the address are ignored. If somebody books the vehicle in between, the form shows *Already booked* and the request is refused with a conflict. No booking is created by RideDNA.

## 8. Security and privacy

- The answers are validated with Zod and explicit checks; invalid or missing values give a clear page, never an error. Unknown parameters are ignored, a repeated parameter uses its first value, a NUL byte is answered 400 by the middleware, a very long address is refused by the server (431).
- Nothing from the address is rendered as markup (React escapes it; the page data of Next.js carries it JSON-escaped). Tested with script and image payloads.
- The page shows no e-mail, user id or owner name; the ranking is the same for every viewer (the only difference: a signed-in user's own vehicles are left out).
- No tracking, no cookie of its own; the unfinished questionnaire stays in the tab's `sessionStorage`.
- **No rate limiting**: the project has no shared store for it and an in-memory counter would not hold across processes. The page does two bounded queries (at most 300 vehicles, one booking query), measured below.

## 9. Files

| File | Role |
|---|---|
| `src/lib/ridedna/answers.ts` | options, Zod validation, address (de)serialisation |
| `src/lib/ridedna/profile.ts` | profile rules |
| `src/lib/ridedna/scoring.ts` | eligibility, scoring, ranking order (pure) |
| `src/lib/ridedna/service.ts` | period, the two queries, price, result |
| `src/components/ridedna/` | questionnaire, option cards, profile card, recommendation card, comparison table, period form |
| `src/app/(public)/ridedna/` | the page, `results/page.tsx`, `loading.tsx`, `error.tsx` |
| `src/app/(public)/vehicles/[id]/page.tsx`, `src/components/booking-panel.tsx` | accept and pre-fill the handed-over period |

## 10. Tests (all run on 2026-10-26)

| Level | File | What |
|---|---|---|
| Unit (45) | `answers.test.ts`, `scoring.test.ts`, `profile.test.ts` | validation and round trip; weights; tables; every eligibility rule and its boundary; the score arithmetic; missing data; explanations; labels; ranking order and tie-break; every profile rule |
| Integration (21, PostgreSQL) | `service.int.test.ts`, `booking-handoff.int.test.ts` | which vehicles are read; three, fewer or none; own vehicles; repeatability; price equals the pricing function; EUR; budget; availability (overlap, back-to-back, cancelled, pending, no dates); Europe/Bucharest and the clock changes; the price shown equals the booking's; a vehicle taken or put in service in between; four people choosing the same vehicle at once give one booking; owner and administrator cannot book; the server recomputes the price |
| HTTP (25) | `e2e/ridedna.py` | public access; hostile input; nothing taken as authoritative; no private data; own vehicles; administrator and owner choosing a vehicle; the period and the in-service vehicle |
| Real browser (44) | `e2e/browser/ridedna.py` | the whole questionnaire with Back, validation and reset; keyboard use; focus; the results; no result; budget too low; two results; dates; the exact period handed to the booking; the vehicle taken in between; login with the day kept; the real booking and its price; widths at 390 px |

Commands: `npm test`, `npm run test:integration`, `E2E_ONLY=ridedna ./e2e/run.sh`, `./e2e/browser/run.sh` (needs `firefox`).

## 11. Performance

On the test database (24 vehicles for the single requests, 36 with the load-test vehicles in the Locust run), one process: an unloaded request to the results page takes about 29 ms, the same as the catalog (31 ms); the two queries take 0.2 ms and 0.1 ms in `EXPLAIN ANALYZE`
(the tables are small, the plans only show that nothing unusual happens). In the mixed Locust scenario (the results page is requested by a part of the visitors; `docs/load-results/ridedna-mixed-*`):
50 users: 3661 requests, 0 failures, results page median 87 ms, 95th percentile 380 ms; 100 users: 4885 requests, 0 failures, median 540 ms, 95th percentile 820 ms, the same range as the catalog (610 ms / 1.1 s).
The cost is server-side rendering, as for the other pages. Nothing is cached: availability must never be stale.

## 12. How to try it by hand

1. Start the application with the demo data ([manual-verification.md](manual-verification.md), preparation).
2. Open `/ridedna`, answer: *Intermediate*, *A2*, *Forest roads and mixed terrain*, *Exploring far* and *Comfort*, *A weekend*, *Just me*, budget *3000 RON*, confirm. Expected: profile *Trail Seeker* and three vehicles with 70 to 80 points and their reasons.
3. Choose a first day 30 days ahead and press *Check availability*: the cards say *Free for your dates*, the price note says *Price for your dates*.
4. Press *Choose this vehicle* (log in as a demo customer if asked): the booking form has the period filled in and the same price as the card.
5. Try *Beginner*, *No motorcycle licence*, *Touring on paved roads*: no result, with the reasons. Try a budget of 50 RON: it says which vehicles fit except for the budget.

## 13. Limitations

- Only the data that exists is used: category, power, engine size, seats, licence category, rates and place. There is no weight, seat height, luggage, range, route or weather data, and no GPS or map. The category tables and the power limits are editorial.
- Of the demo fleet, only the platform's 17 models have a category; vehicles without one are never recommended. Several ATVs have no seat count or horsepower stored, which limits the results for a passenger or a beginner.
- The licence rule uses the categories stored on the vehicles (A, A2); ATV and unrecorded requirements are not verified by anything, and no licence is checked.
- The weekend flat rate is not reached by the proposed periods (see section 6).
- Not rate limited (section 8). The first 300 approved vehicles by id are considered; a larger fleet would need a database-side filter.
- The result is not saved: there is no history of profiles.
- Checked in a scripted headless Firefox, not by a person (see [presentation.md](presentation.md)).

## 14. Possible improvements

A category field with an explicit "licence needed" for ATVs, more specifications (weight, seat height, luggage) so that more questions can be real, a database-side pre-filter and a shared rate limiter for a larger fleet, saved profiles for signed-in users with a retention rule, and a human review of the category tables with the rental staff.
