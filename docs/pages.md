# Pages and CRUD (Stage 2)

Access is enforced on the server: a page calls `requireRole(...)`, which reads the role from the database and redirects
a visitor to `/login` or a signed-in user with the wrong role to `/forbidden`. Server actions and API routes repeat the check
and the ownership check (someone else's resource answers 404).

## Pages

### Public

| Path | Purpose | Who | Main actions |
|---|---|---|---|
| `/` | Home: hero, search, categories, featured vehicles, how it works, locations | everyone | search, open a category or vehicle, switch RON/EUR |
| `/vehicles` | Catalog with filters (type, category, location, county, dates, text) and pagination | everyone | filter, open a vehicle |
| `/vehicles/[id]` | Vehicle page: gallery, specifications, location, price, availability calendar, booking form | everyone (booking needs `CUSTOMER`, `OWNER` or `RENTAL_COMPANY`) | see the exact price, book |
| `/book/[vehicleId]` | Old link, redirects to the vehicle page | everyone | |
| `/ridedna` | RideDNA questionnaire: 7 steps, rider profile in the summary | everyone | answer, go back, change an answer, start over, ask for the recommendations |
| `/ridedna/results` | Profile, up to three recommended vehicles with reasons and a comparison, choice of the first day and length (availability and exact price) | everyone | change the answers, check a day, view a vehicle, choose a vehicle (opens its booking form with the period filled in) |
| `/login`, `/register` | Authentication | visitors | log in, create an account (customer, owner or company) |
| `/forbidden`, not-found, error pages | Access denied, unknown address, unexpected error | everyone | |

### Customer area (`CUSTOMER`, `OWNER`, `RENTAL_COMPANY`)

| Path | Purpose | Main actions |
|---|---|---|
| `/account` | Dashboard: next booking, counts, shortcuts | |
| `/account/bookings`, `/account/bookings/[id]` | Own bookings (upcoming, history), detail with status history | cancel before the start |
| `/account/profile` | Name, phone, password | update profile, change password |

### Provider area (`OWNER`, `RENTAL_COMPANY`)

| Path | Purpose | Main actions |
|---|---|---|
| `/provider` | Dashboard with real figures: vehicles, bookings, earnings, papers due | |
| `/provider/vehicles`, `/new`, `/[id]` | Own listings and their state (pending, approved, rejected) | create a listing, edit details and specifications, upload, delete and reorder photos, add, edit and delete maintenance records, resubmit a rejected listing |
| `/provider/bookings`, `/provider/calendar` | Bookings of own vehicles; month calendar | read |
| `/provider/finance` | Earned, expected, paid out, balance owed; bookings with commission; payouts | **download CSV** of own completed bookings (optionally between two dates) |
| `/provider/quotes` | `RENTAL_COMPANY` only: bulk offers | request an offer, accept or decline it |

### Administration (`ADMIN`)

| Path | Purpose | Main actions |
|---|---|---|
| `/admin` | Statistics and alerts (late handovers, owed balances, expiring papers, pending listings) | |
| `/admin/vehicles`, `/new`, `/[id]` | All vehicles; create and edit the platform fleet; moderation; status | approve or reject a listing, set `AVAILABLE` / `IN_SERVICE` / `RETIRED`, edit details and photos |
| `/admin/bookings`, `/[id]` | All bookings, status lifecycle, payments, history | confirm, hand over, complete, cancel (with a reason), record a payment in RON or EUR |
| `/admin/maintenance` | Service, ITP and RCA across the fleet (records are added, edited and deleted on the vehicle page, `?tab=maintenance`) | follow deadlines |
| `/admin/quotes` | Bulk offers of all companies | follow, see allocations |
| `/admin/payouts` | What is owed to each owner and company, commission rates | record a payout, set a company rate (minimum 5%) |
| `/admin/finance` | Monthly revenue, commission, platform income, chart | **download CSV** of completed bookings (optionally between two dates) |
| `/admin/users` | Accounts and roles | change a role (with a preview of consequences and a confirmation) |
| `/admin/locations` | Pick-up points | create and edit a location |

Old addresses `/owner`, `/bookings` and `/quotes` redirect to the current pages.

## CRUD by entity

Business rules decide where a record is archived instead of erased: bookings, payments and history are an accounting trail.

| Entity | Create | Read | Update | Delete |
|---|---|---|---|---|
| User | `/register`; the first admin by seed | `/admin/users`, `/account/profile` | profile and password (own); role and company rate (admin) | not offered: accounts keep their history; demotion has safeguards |
| Location | `/admin/locations` | catalog, home | `/admin/locations` | not offered: vehicles reference it |
| Vehicle | `/provider/vehicles/new`, `/admin/vehicles/new` | catalog, dashboards | details, specifications, status, listing moderation | **archived**: status `RETIRED` (blocked while a booking is active), never erased |
| Vehicle photo | upload with the new-vehicle form (owner, company, administrator) or on the photos tab, with a preview before saving; the server checks the content, the name, the declared type, the size and the count | vehicle page | choose the cover | delete |
| Maintenance record | provider and admin forms | vehicle and admin pages | edit form (pencil icon in the history; type, dates, notes; the record stays on its vehicle) | delete |
| Booking | booking form → `POST /api/bookings` | account, provider and admin pages | status transitions, strictly validated | **cancelled**: status `CANCELLED` with a history row; never erased |
| Payment | admin on a booking | booking detail, finance | not offered: it is an accounting entry | not offered |
| Payout | `/admin/payouts` | admin and provider finance | not offered | not offered |
| Offer (quote) and its items | company form | company and admin pages | accept, decline, automatic recalculation with a new revision | not offered |

## Catalog categories

The category chips and the category list of the filter show only the categories of the chosen type (an ATV filter does not offer *Cruiser*).
The number next to a category is the number of approved, available vehicles of that category in the whole catalog; it does not change with the other filters.

## Validation and feedback

- Every input is validated on the server with Zod (text length, NUL characters, dates, money, enums); the same limits appear
  as `required`, `min` and `max` attributes on the forms. Booking rules (overlap, past dates, limits) are checked in the
  booking service and by the database.
- Forms show the error next to the cause and a confirmation after success; role changes show their consequences and need a confirmation, an administrator must give a reason to cancel a booking.
- Tests: `e2e/*.py` submit every form like a browser (see [../e2e/README.md](../e2e/README.md)) and `src/lib/*.int.test.ts` test the services on PostgreSQL.
