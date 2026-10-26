# Reports and export (Stage 5)

Format implemented: **CSV** (the course allows PDF, CSV or Excel). PDF and Excel are not implemented.

## What exists

| Report | Where | Who | Content |
|---|---|---|---|
| Monthly finance | `/admin/finance` (3, 6 or 12 months) | `ADMIN` | bookings, charged, commission, kept by the platform, per month, with a chart; computed on completed bookings by completion month (Bucharest time) |
| Earnings | `/provider/finance` | own `OWNER` / `RENTAL_COMPANY` | earned, expected, paid out, balance, bookings with commission and share, payouts |
| Payouts and balances | `/admin/payouts` | `ADMIN` | what is owed to each owner and company |
| **CSV: completed bookings** | `GET /admin/finance/export?from=YYYY-MM-DD&to=YYYY-MM-DD` | `ADMIN` | every completed booking |
| **CSV: my completed bookings** | `GET /provider/finance/export?from=...&to=...` | `OWNER`, `RENTAL_COMPANY` | only bookings of the caller's own vehicles |

Both pages have a form with two optional dates ("Completed from / to", inclusive, Bucharest calendar days, filtering by the
completion day). Empty dates export everything (at most 5000 rows, newest first).

## File format

UTF-8 with a byte order mark (so Excel opens diacritics correctly), comma separated, header row, one row per booking:
`booking, vehicle, plate, offered_by, start_bucharest, end_bucharest, completed_bucharest, charged_ron, commission_percent, commission_ron, owner_share_ron`.
Money is written with two decimals from integer bani (`9999` → `99.99`); the commission rate and amounts are the **snapshot kept on the booking**,
so the file always agrees with what the customer was charged. Cells that start with `=`, `+`, `-`, `@` are neutralized against spreadsheet formula injection.

## Protection

Anonymous requests get 401; a role without access gets 403 (a customer on both routes, an owner on the admin route, an admin on the provider route); the provider
route filters by the signed-in user's id taken from the session, never from the request; malformed or reversed dates get 400.

## How to demonstrate

1. Seed the demo data (see [presentation.md](presentation.md)) and log in as `demo.owner@example.com`.
2. Open **Provider area → Earnings**, choose a date range and press **Download CSV**; open the file in a spreadsheet: only the owner's vehicles appear and the commission column shows 15.00.
3. Log in as the administrator, open **Finance**, download the CSV: it contains all providers and the platform fleet at 0.00%.
4. Show that the totals of the file match the **Earnings** and **Finance** pages and that `/admin/finance/export` answers 403 for the owner.

## Verification

- `src/lib/export-report.test.ts`: date parsing, `to` inclusive, the 23-hour day of the spring clock change, malformed and reversed ranges.
- `src/lib/export-report.int.test.ts` (PostgreSQL): the day boundaries to the millisecond in winter (UTC+2) and summer (UTC+3) time
  (`21:59:59.999Z` is still the old day, `22:00:00.000Z` is the next one), the 23-hour and 25-hour days of the clock changes,
  only `COMPLETED` bookings, isolation of one provider's vehicles from another's and from the platform fleet, the byte order mark,
  the header, diacritics, two-decimal money (`9999` bani → `99.99`), the commission snapshot (`15.00`, `84.99`) and formula neutralization.
- `e2e/finance.py` (8 checks over HTTP): 401 and 403 for every wrong role on both routes, an owner's file has exactly the owner's rows
  and the company's file the company's rows (counts equal to SQL, no booking in both), the date filter equals SQL, 400 for bad dates, encoding and header.
- Not verified: opening the downloaded file in Excel or LibreOffice (no spreadsheet program was used); the browser's download dialog.
