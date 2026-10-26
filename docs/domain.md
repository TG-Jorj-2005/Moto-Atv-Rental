# Domain: renting motorcycles and ATVs (Stage 0 of the project)

## The domain

Renting a motorcycle or an ATV is a small-fleet business with a few hard problems: a vehicle can be in only one place at
a time, prices depend on the length of the rental (and on weekends), the vehicles need regular service and paperwork
(service, ITP, RCA), and the money has to be split between whoever owns the vehicle and whoever runs the platform.
Done on paper or in a spreadsheet, this leads to double bookings, forgotten inspections and wrong commission sums.

**Moto & ATV Rental** is a web marketplace that handles it in one place. The platform has its own fleet, and private
owners and rental companies can list theirs. Customers search by dates, location and category, book a vehicle, and
an administrator hands it over and closes the booking. Payments and payouts are recorded by hand (no online payments).

## The problem the application solves

| Problem | How the application answers it |
|---|---|
| Two customers for the same vehicle and time | A database exclusion constraint makes an overlapping booking impossible, even under concurrent requests |
| Customers cannot see what is free | The catalog filters by dates, location, type and category and shows only vehicles free for the whole period |
| Owners do not know what they earned | Each owner has an earnings page: completed bookings, commission, their share, payouts and the balance owed |
| Vehicles need service and papers | Maintenance records (service, ITP, RCA, other) with next due dates; a vehicle in service cannot be booked or handed over |
| The commission must be provable | The commission rate and amounts are frozen on the booking when it is made and never change afterwards |
| Companies need many vehicles at once | Bulk offers: the company asks for a quantity and period, the platform proposes the vehicles that are really free, with a discount |
| The administrator needs the numbers | Statistics, alerts (late handovers, owed balances, expiring papers), monthly finance report and CSV export |

## Users and roles

| Role | Who | Responsibilities |
|---|---|---|
| Visitor (not signed in) | Anyone | Browse the catalog, vehicle pages, locations; register or log in |
| `CUSTOMER` | Someone who rents | Book vehicles, follow and cancel own bookings before they start, edit profile and password |
| `OWNER` | A private person with vehicles | Everything a customer does, plus list vehicles (photos, specifications), keep their maintenance, see own calendar, bookings and earnings. Fixed 15% commission |
| `RENTAL_COMPANY` | A business | Like an owner, plus request bulk offers. The commission is set per company by an administrator (minimum 5%) |
| `ADMIN` | Platform staff | Approve listings, manage vehicle status and the platform fleet, hand over, complete and cancel bookings, record payments and payouts, manage users, roles, commission rates and locations, read reports and export them. An administrator does not rent |

## Main scenarios

1. **Explore:** the visitor opens the catalog, filters by category, location and dates, and opens a vehicle page with gallery,
   specifications, location, price and a calendar of the next days.
2. **Availability and booking:** the signed-in user chooses start and end, sees the exact price (weekend rule, discounts) and
   confirms. The booking is `PENDING`; if another booking got the slot first the answer is a clear 409, never a double booking.
3. **Handover and return:** the administrator confirms the booking, hands the vehicle over from one hour before the start
   (`ACTIVE`), and completes it on return. Payments are recorded in RON or EUR. Completion freezes the owner's share.
4. **Fleet administration:** providers list vehicles, the administrator approves or rejects them, sets `AVAILABLE`,
   `IN_SERVICE` or `RETIRED`, and edits the platform fleet. Vehicles are retired, not deleted, to keep the history.
5. **Maintenance:** service, ITP and RCA records with the next deadline; the dashboards warn about papers that expire soon.
6. **Bulk offers:** a company requests, for example, ten ATVs for a weekend; the system allocates the platform fleet first,
   then owners with the fewest bookings, applies a 5% (5 vehicles) or 10% (10 vehicles) discount and the company accepts
   the final list, all or nothing.
7. **Reporting:** monthly revenue, commission and platform income; completed-bookings CSV for the administrator, and a
   CSV with only their own bookings for each owner and company.

## Business rules in short

The full list is in [business-rules.md](business-rules.md). The essential ones:

- No overlapping non-cancelled bookings per vehicle (database constraint); at most one `ACTIVE` booking per vehicle.
- Only signed-in `CUSTOMER`, `OWNER` and `RENTAL_COMPANY` users book; the e-mail must be the account's; at most 3 `PENDING`
  bookings per user; nobody books their own vehicle.
- Status changes follow a strict lifecycle (`PENDING → CONFIRMED → ACTIVE → COMPLETED`, cancellation rules per role) and every
  change is written to the status history in the same transaction. Nothing changes status because of the clock.
- Commission: platform fleet 0%, `OWNER` 15%, `RENTAL_COMPANY` configurable and never below 5%. It applies to the price
  actually charged, never to deposits or penalties (the application has none). Money is stored as integer bani, rates as basis points.
- All business days and weekend rules use Europe/Bucharest time.
- The role is read from the database on every request.

## Limits of the application

Online payments, e-mail, PDF contracts, deposits, damages, refunds, an audit log beyond the booking history, and password
reset are **not** implemented (see "Known limitations" in the [README](../README.md)). The demonstration data is fictional and labelled as such.
