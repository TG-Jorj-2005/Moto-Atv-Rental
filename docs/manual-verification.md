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

## Photos when adding a vehicle

| # | Do | Expected |
|---|---|---|
| P1 | As `demo.company@`, open *My vehicles → Add a vehicle*, fill the form, choose one photo in *Photos (optional)* | A preview appears with the *Cover* mark and "1 of 8 photos selected" |
| P2 | Choose a text file renamed `.jpg`, then a `.php` file | A red message for each; they are not added |
| P3 | Choose a second photo, then remove the first with its × button | One preview left, now the cover |
| P4 | Press *Create the listing* | The photos tab opens: "created with its photos", the photos are shown |
| P5 | As the administrator approve the listing, then open the catalog and search for the vehicle | The card and the vehicle page show the cover photo |
| P6 | Add another vehicle without any photo | It works as before (photos can be added later on the photos tab) |

## RideDNA (extra feature, see [ridedna.md](ridedna.md))

| # | Do | Expected |
|---|---|---|
| R1 | Open `/ridedna` (also reachable from the home page and the header) | The introduction and *Step 1 of 7: How much do you ride?* |
| R2 | Press *Continue* without choosing | A message asks you to choose; you stay on the step |
| R3 | Answer *Intermediate*, *A2*, *Forest roads and mixed terrain*, *Exploring far* and *Comfort* (a third priority is greyed out), *A weekend*, *Just me*, budget *3000 RON*; use *Back* once and check that the answers are kept | The summary shows the profile *Trail Seeker* and your answers; each has a *Change* button |
| R4 | Press *Show my recommendations* before ticking the note | A message asks you to confirm the note |
| R5 | Tick the note and press the button | Three vehicles, best score first, each with *Why it fits you*, the price, *Choose this vehicle* and *View details*; a *Side by side* table |
| R6 | Choose a first day 30 days ahead and press *Check availability* | *Free for your dates right now* on each card and *Price for your dates* |
| R7 | Press *Choose this vehicle* as a visitor, log in as `demo.customer@` | You come back to the vehicle with the period filled in; the total price equals the card's price |
| R8 | In another window book the same vehicle for part of that period, then reload the form | *Already booked for part of this period*; the request button is disabled |
| R9 | Answer *Beginner*, *No motorcycle licence*, *Touring on paved roads* | *None of our vehicles fits all your answers* with the reasons; no invented vehicle |
| R10 | At 390 px, repeat R1 to R5 | No sideways scrolling; the comparison table scrolls inside its card; the options are easy to tap |
| R11 | Use only the keyboard on the questionnaire (Tab, Space, Enter) | Every option and button can be reached and used; the focus moves to the new question |

## What was automated and what was not

Steps 1 to 15 (including the content of both CSV files, but not the spreadsheet) and the 390 px widths of step 16 were driven in a real headless Firefox by `./e2e/browser/run.sh`
(see [presentation.md](presentation.md)); date fields are set by script. **Not covered by any automatic check:** how it looks and feels to a person, opening the files in Excel or LibreOffice,
step 17 (mobile menu), keyboard use, other browsers (Chrome, Safari), a real phone.
