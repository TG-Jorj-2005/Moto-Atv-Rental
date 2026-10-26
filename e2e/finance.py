"""Money end to end: commission snapshots and rounding, completion, mixed RON/EUR payments, balances, payouts, and
that the dashboards show exactly what the database holds."""
import sys, os, re, json, subprocess, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from driver import *
env = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")).read()
AE = re.search(r"^ADMIN_EMAIL=(.*)$", env, re.M).group(1).strip('"'); AP = re.search(r"^ADMIN_PASSWORD=(.*)$", env, re.M).group(1).strip('"')
DEMO = "Demo-pass-2030!"
for jar, e, p in [("/tmp/jf_a", AE, AP), ("/tmp/jf_c", "demo.customer@example.com", DEMO), ("/tmp/jf_o", "demo.owner@example.com", DEMO), ("/tmp/jf_k", "demo.company@example.com", DEMO)]: login(jar, e, p)
A, C, O, K = "/tmp/jf_a", "/tmp/jf_c", "/tmp/jf_o", "/tmp/jf_k"

def post(jar, body):
    out = subprocess.run(["curl", "-s", "-o", "/tmp/f.out", "-w", "%{http_code}", "-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(body), "-b", jar, BASE + "/api/bookings"], capture_output=True, text=True).stdout
    try: return out, json.load(open("/tmp/f.out"))
    except Exception: return out, None
def when(days, hour): return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=days)).replace(hour=hour, minute=0, second=0, microsecond=0).strftime("%Y-%m-%dT%H:%M:%S.000Z")
reg = find_form(get(None, "/register"), has=["name", "email", "password", "role"])
USERS = []
def fresh(i):
    jar, em = f"/tmp/jf_u{i}", f"fin.user{i}@example.test"
    open(jar, "w").close()
    submit(jar, "/register", reg, {"name": f"Fin User {i}", "email": em, "password": "parola-lunga-1", "role": "CUSTOMER"})
    login(jar, em, "parola-lunga-1")
    return jar, {"fullName": f"Fin User {i}", "email": em, "phone": "0700000000"}
U = [fresh(i) for i in range(8)]

own_v = sql("select id from vehicles where plate='DM-01-ATV'"); co_v = sql("select id from vehicles where owner_id=(select id from users where email='demo.company@example.com') limit 1"); fleet_v = sql("select id from vehicles where owner_id is null and category='CRUISER' limit 1")
for v in (own_v, co_v, fleet_v): sql(f"update vehicles set hourly_rate=3333, daily_rate=33333, weekend_rate=null, status='AVAILABLE' where id='{v}'")
sql("update users set commission_bps=750 where email='demo.company@example.com'")

print("== COMMISSION SNAPSHOT AND ROUNDING (half up, integer bani)")
cases = {}
for label, vid, day in [("owner", own_v, 40), ("company", co_v, 41), ("fleet", fleet_v, 42)]:
    code, r = post(U[day - 40][0], {"vehicleId": vid, "startAt": when(day, 8), "endAt": when(day, 9), "customer": U[day - 40][1]})
    cases[label] = r["id"] if code == "201" else None
    check(f"{label}: a 1 hour booking is created at the exact hourly price", code == "201" and r["totalPrice"] == 3333, (code, r))
row = lambda bid: sql(f"select total_price||'|'||coalesce(commission_bps::text,'')||'|'||coalesce(commission_amount::text,'')||'|'||coalesce(owner_amount::text,'') from bookings where id='{bid}'")
check("owner 15%: 3333 x 15% = 499.95 rounds up to 500, owner keeps 2833", row(cases["owner"]) == "3333|1500|500|2833", row(cases["owner"]))
check("company 7.5%: 3333 x 7.5% = 249.975 rounds up to 250, company keeps 3083", row(cases["company"]) == "3333|750|250|3083", row(cases["company"]))
check("platform fleet: 0% and no owner share", row(cases["fleet"]) in ("3333|0|0|0", "3333|0|0|"), row(cases["fleet"]))
sql("update users set commission_bps=1000 where email='demo.company@example.com'")
code, r = post(U[3][0], {"vehicleId": co_v, "startAt": when(43, 8), "endAt": when(43, 9), "customer": U[3][1]})
check("after the admin changes the company rate to 10% a new booking uses it", row(r["id"]) == "3333|1000|333|3000", row(r["id"]))
check("...and the earlier booking keeps the rate it was made with", row(cases["company"]) == "3333|750|250|3083")
sql("update users set commission_bps=300 where email='demo.company@example.com'")
code, r = post(U[4][0], {"vehicleId": co_v, "startAt": when(44, 8), "endAt": when(44, 9), "customer": U[4][1]})
check("a company rate below 5% in the database is never used (clamped to 5%)", row(r["id"]).split("|")[1] == "500", row(r["id"]))

print("== LIFECYCLE: confirm, hand over, complete, pay")
bid = post(U[5][0], {"vehicleId": own_v, "startAt": when(50, 8), "endAt": when(50, 11), "customer": U[5][1]})[1]["id"]
check("a 3 hour booking costs 3 x 3333 = 9999", sql(f"select total_price from bookings where id='{bid}'") == "9999")
page = get(A, f"/admin/bookings/{bid}"); act = find_form(page, has=["bookingId", "reason"])
submit(A, f"/admin/bookings/{bid}", act, {}, button=("to", "CONFIRMED"))
check("the admin confirms it", sql(f"select status from bookings where id='{bid}'") == "CONFIRMED")
r = submit(A, f"/admin/bookings/{bid}", find_form(get(A, f"/admin/bookings/{bid}"), has=["bookingId", "reason"]), {}, button=("to", "ACTIVE"))
check("a handover days before the start is refused (too early)", "error=TOO_EARLY" in r and sql(f"select status from bookings where id='{bid}'") == "CONFIRMED", r)
sql(f"update bookings set start_at = now() - interval '10 minutes', end_at = now() + interval '170 minutes' where id='{bid}'")
r = submit(A, f"/admin/bookings/{bid}", find_form(get(A, f"/admin/bookings/{bid}"), has=["bookingId", "reason"]), {}, button=("to", "ACTIVE"))
check("on time (10 minutes after the start) the handover needs no reason", sql(f"select status from bookings where id='{bid}'") == "ACTIVE", r)
owed_before = int(sql("select coalesce(sum(owner_amount),0) from bookings where status='COMPLETED' and owner_amount is not null") or 0) - int(sql("select coalesce(sum(amount),0) from payouts"))
r = submit(A, f"/admin/bookings/{bid}", find_form(get(A, f"/admin/bookings/{bid}"), has=["bookingId", "reason"]), {}, button=("to", "COMPLETED"))
check("completing with nothing paid is allowed and warns about the whole balance", sql(f"select status from bookings where id='{bid}'") == "COMPLETED" and "unpaid=9999" in r, r)
check("the commission only accrues now: completed_at is set and the owner share counts", sql(f"select (completed_at is not null)::text from bookings where id='{bid}'") == "true")
pay = find_form(get(A, f"/admin/bookings/{bid}"), has=["bookingId", "amount"])
submit(A, f"/admin/bookings/{bid}", pay, {"amount": "20", "currency": "RON", "method": "CASH"})
submit(A, f"/admin/bookings/{bid}", pay, {"amount": "5", "currency": "EUR", "method": "BANK_TRANSFER"})
check("20 RON in cash and 5 EUR at 5.0 are stored as 2000 + 2500 bani, the EUR one with its rate", sql(f"select string_agg(currency||':'||amount||':'||coalesce(paid_amount::text,''), ',' order by amount) from payments where booking_id='{bid}'") == "RON:2000:2000,EUR:2500:500", sql(f"select string_agg(currency||':'||amount||':'||coalesce(paid_amount::text,''), ',' order by amount) from payments where booking_id='{bid}'"))
page = text(get(A, f"/admin/bookings/{bid}"))
check("the booking page shows paid 45 RON and still to pay 55 RON (9999 - 4500 = 5499)", "Paid 45 RON" in page and "Still to pay 55 RON" in page, page[page.find("Money"):page.find("Money") + 160])
r = submit(A, f"/admin/bookings/{bid}", pay, {"amount": "0", "currency": "RON", "method": "CASH"})
check("a zero payment is refused", "error=PAYMENT_INVALID" in r, r)

print("== THE DASHBOARDS SHOW WHAT THE DATABASE HOLDS")
owed = int(sql("select coalesce(sum(owner_amount),0) from bookings where status='COMPLETED' and owner_amount is not null")) - int(sql("select coalesce(sum(amount),0) from payouts"))
check("completing the booking added its owner share (9999 - 1500 = 8499 bani) to what is owed", owed - owed_before == 9999 - 1500, (owed, owed_before))
unpaid = int(sql("select coalesce(sum(b.total_price - p.s),0) from bookings b cross join lateral (select coalesce(sum(amount),0) s from payments where booking_id=b.id) p where b.status in ('COMPLETED','ACTIVE') and b.total_price > p.s"))
adm = text(get(A, "/admin"))
check(f"the admin overview shows the unpaid balance of {unpaid/100:.0f} RON", f"{unpaid/100:.0f} RON" in adm, adm[adm.find("Unpaid"):adm.find("Unpaid") + 80])
check(f"...and {owed/100:.0f} RON owed to owners and companies", f"{owed/100:.0f} RON" in adm, adm[adm.find("Owed"):adm.find("Owed") + 80])
submit(A, "/admin/payouts", find_form(get(A, "/admin/payouts"), has=["ownerId", "amountRon"]), {"ownerId": sql("select id from users where email='demo.owner@example.com'"), "amountRon": "10", "note": "partial payout"})
owed2 = int(sql("select coalesce(sum(owner_amount),0) from bookings where status='COMPLETED' and owner_amount is not null")) - int(sql("select coalesce(sum(amount),0) from payouts"))
check("a payout of 10 RON lowers what is owed by exactly 1000 bani", owed - owed2 == 1000, (owed, owed2))
check("the overview follows", f"{owed2/100:.0f} RON" in text(get(A, "/admin")))

own_id = sql("select id from users where email='demo.owner@example.com'")
mine = int(sql(f"select coalesce(sum(b.owner_amount),0) from bookings b join vehicles v on v.id=b.vehicle_id where v.owner_id='{own_id}' and b.status='COMPLETED'"))
paid_out = int(sql(f"select coalesce(sum(amount),0) from payouts where owner_id='{own_id}'"))
fin = text(get(O, "/provider/finance"))
check(f"the owner's earnings page shows {mine/100:.0f} RON earned and {paid_out/100:.0f} RON paid out", f"{mine/100:.0f} RON" in fin and f"{paid_out/100:.0f} RON" in fin, fin[:300])
co_id = sql("select id from users where email='demo.company@example.com'")
other_earned = int(sql(f"select coalesce(sum(b.owner_amount),0) from bookings b join vehicles v on v.id=b.vehicle_id where v.owner_id='{co_id}' and b.status='COMPLETED'"))
csv = get(A, "/admin/finance/export"); lines = csv.strip().splitlines()
mine_line = [l for l in lines if bid in l]
check("the CSV row of the new booking: 99.99 charged, 15.00 percent, 15.00 commission (9999 x 15% = 1499.85, rounded up), 84.99 owner share", len(mine_line) == 1 and mine_line[0].endswith(",99.99,15.00,15.00,84.99"), mine_line)
sql(f"update vehicles set name = '=CMD|calc!A1' where id='{own_v}'")
csv = get(A, "/admin/finance/export")
check("a vehicle name that looks like a formula is neutralized in the CSV", "'=CMD|calc!A1" in csv and ",=CMD" not in csv)

# --- CSV export: permissions, per-provider isolation, date filters, encoding ---
check("export: anonymous gets 401 and a customer 403 on both routes", all(status(j, r).startswith(c) for j, r, c in [(None, "/admin/finance/export", "401"), (None, "/provider/finance/export", "401"), (C, "/admin/finance/export", "403"), (C, "/provider/finance/export", "403")]), [status(None, "/admin/finance/export"), status(C, "/provider/finance/export")])
check("export: an owner cannot use the admin export and an admin cannot use the provider one", status(O, "/admin/finance/export").startswith("403") and status(A, "/provider/finance/export").startswith("403"))
def rows(jar, path): return get(jar, path).lstrip("\ufeff").strip().splitlines()[1:]
own_n = int(sql(f"select count(*) from bookings b join vehicles v on v.id=b.vehicle_id where v.owner_id='{own_id}' and b.status='COMPLETED'"))
co_n = int(sql(f"select count(*) from bookings b join vehicles v on v.id=b.vehicle_id where v.owner_id='{co_id}' and b.status='COMPLETED'"))
all_n = int(sql("select count(*) from bookings where status='COMPLETED'"))
o_rows, k_rows, a_rows = rows(O, "/provider/finance/export"), rows(K, "/provider/finance/export"), rows(A, "/admin/finance/export")
check(f"export: the owner gets exactly their {own_n} completed bookings, the company {co_n}, the admin all {all_n}", (len(o_rows), len(k_rows), len(a_rows)) == (own_n, co_n, all_n), (len(o_rows), len(k_rows), len(a_rows)))
check("export: no booking appears in both the owner's and the company's file", not ({r.split(",")[0] for r in o_rows} & {r.split(",")[0] for r in k_rows}))
raw = subprocess.run(["curl", "-s", "-b", A, BASE + "/admin/finance/export"], capture_output=True).stdout
check("export: UTF-8 with a byte order mark and the documented header", raw.startswith(b"\xef\xbb\xbfbooking,vehicle,plate,offered_by,start_bucharest") and raw.endswith(b"\n"))
check("export: a future range returns only the header, a reversed or malformed range 400", len(rows(A, "/admin/finance/export?from=2099-01-01&to=2099-12-31")) == 0 and all(status(A, f"/admin/finance/export?{q}").startswith("400") for q in ["from=2027-05-02&to=2027-05-01", "from=nope", "to=2027-02-30"]))
d1, d2 = "2026-10-08", "2026-10-09"
in_range = int(sql(f"select count(*) from bookings where status='COMPLETED' and (completed_at at time zone 'Europe/Bucharest')::date between '{d1}' and '{d2}'"))
check(f"export: the date filter keeps exactly the {in_range} bookings completed on those Bucharest days", len(rows(A, f"/admin/finance/export?from={d1}&to={d2}")) == in_range, in_range)
fin_a = text(get(A, "/admin/finance")); fin_o = text(get(O, "/provider/finance"))
check("export: the admin and provider pages show a working export form", 'action="/admin/finance/export"' in get(A, "/admin/finance") and 'action="/provider/finance/export"' in get(O, "/provider/finance"))
print("FAILS:", FAILS)
