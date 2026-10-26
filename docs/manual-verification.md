# Manual verification (for the person who presents the project)

Automatic checks cannot replace a person looking at the screen. This list is what to click through before the defence.
Each step has the expected result. Use a **database that is not a real deployment**: the demo accounts are fictional.

## Preparation

```bash
docker compose up -d db
npx prisma migrate deploy
SEED_DEMO_USERS=true DEMO_PASSWORD='choose-a-password' npx prisma db seed     # admin, 12 locations, 17 vehicles, demo users
npm run build && AUTH_TRUST_HOST=true npm start                              # http://localhost:3000
```

Accounts: the administrator from `.env` (`ADMIN_EMAIL`, `ADMIN_PASSWORD`), and `demo.customer@`, `demo.customer2@`, `demo.owner@`,
`demo.company@example.com` with the demo password. Use a window of about 390 px (browser developer tools, device mode) for the phone steps.

## Steps

| # | Do | Expected |
|---|---|---|
| 1 | Open `/`. Press **ATVs** in the header | The catalog shows only ATVs; the category chips are *Sport ATV* and *Utility ATV* only (no *Cruiser*) |
| 2 | Press **All vehicles**, type `Rebel` in *Search by name*, press the search button | Only the Honda Rebel models are listed |
| 3 | Log in with a wrong password | You stay on `/login` and an error is shown |
| 4 | Log in as `demo.customer@` | The header shows *Demo Customer* |
| 5 | Open `/admin` | *Access denied* page with *Home* and *My account* |
| 6 | Open a vehicle, choose a start and end 25 days ahead (3 hours), fill the phone, press the booking button | The price is shown before sending; the booking page opens with *Booking requested*; status *Pending* |
| 7 | Open the same vehicle, choose a period that overlaps step 6 | A message says the vehicle is already booked; no second booking |
| 8 | On the booking page press **Cancel booking** | Status *Cancelled* |
| 9 | Log in as `demo.owner@`, open *My vehicles → a vehicle → Maintenance* | The list of records and the add form |
| 10 | Add a *Service* record (done 2030-03-01, next 2031-03-01), then press the pencil icon | The edit form is prefilled; the title is *Edit the record* |
| 11 | Set the next deadline before the date done, press *Save changes* | A message says the deadline must be after the date done; nothing changes |
| 12 | Set a valid deadline, press *Save changes* | *The maintenance record was saved*; the history shows the new values |
| 13 | *Earnings*: leave the dates empty and press **Download CSV** | `my-completed-bookings.csv` is saved; open it in a spreadsheet: only the owner's vehicles, commission 15.00, accents correct |
| 14 | Log in as the administrator, *Finance and reports*, choose a range with no bookings, press **Download CSV** | A file with the header only |
| 15 | Same page, empty dates | `completed-bookings.csv` with all providers; platform-fleet rows show 0.00 commission |
| 16 | At 390 px open the catalog, a vehicle, *My bookings*, the owner's *Earnings* and the admin *Bookings* | No page scrolls sideways; wide tables scroll **inside** their card |
| 17 | Open the mobile menu (hamburger) on a dashboard and on the public site | The menu opens, every entry works, the log-out button works |

## What was automated and what was not

Steps 1 to 15 (including the content of both CSV files, but not the spreadsheet) and the 390 px widths of step 16 were driven in a real headless Firefox by `./e2e/browser/run.sh`
(see [presentation.md](presentation.md)); date fields are set by script. **Not covered by any automatic check:** how it looks and feels to a person, opening the files in Excel or LibreOffice,
step 17 (mobile menu), keyboard use, other browsers (Chrome, Safari), a real phone.
