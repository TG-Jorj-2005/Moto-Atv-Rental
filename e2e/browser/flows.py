"""Real-browser flows (headless Firefox driven through Marionette): public navigation and catalog filters, login (wrong and
right password), booking with a conflict, cancelling, editing a maintenance record and the CSV downloads of the admin and an
owner. Also measures the width of the main pages at 390 px. Needs the app on $BASE (default http://localhost:3100) running
on the TEST database seeded with the demo users; use ./e2e/browser/run.sh, which prepares all of it."""
import csv, datetime as dt, io, os, re, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import *  # noqa: F401,F403
from helpers import ADMIN, BASE, DEMO, DL, EL, SET_VALUE, Browser, FAILS, cards, check, click, download, login, set_value, sql, wait_text

print("== PUBLIC NAVIGATION AND CATALOG")
b = Browser(download_dir=DL)
b.get(BASE + "/")
b.click("header a[href='/vehicles?type=ATV']"); b.wait_url("type=ATV"); time.sleep(0.5)
atv = int(sql("select count(*) from vehicles where type='ATV' and listing_status='APPROVED' and status='AVAILABLE'"))
check("the ATVs link of the header opens the catalog filtered by type", "type=ATV" in b.url() and cards(b) == min(atv, 12), (b.url(), cards(b), atv))
chips = b.js("return [...document.querySelectorAll('nav[aria-label=Categories] a')].map(a => a.innerText.replace(/\\s+/g, ' ').trim())")
check("with the ATV filter only ATV categories are offered as chips", chips and all(c == "All" or c.startswith(("Sport ATV", "Utility ATV")) for c in chips), chips)
b.get(BASE + "/vehicles"); chips = b.js("return [...document.querySelectorAll('nav[aria-label=Categories] a')].map(a => a.innerText.replace(/\\s+/g, ' ').trim())")
check("without a type filter all six categories are offered", len(chips) == 7, chips)
b.click("nav[aria-label=Categories] a[href*='category=ATV_UTILITY']"); b.wait_url("category=ATV_UTILITY"); time.sleep(0.5)
n = int(sql("select count(*) from vehicles where category='ATV_UTILITY' and listing_status='APPROVED' and status='AVAILABLE'"))
check("a category chip filters the list to that category", "category=ATV_UTILITY" in b.url() and cards(b) == n and n > 0, (b.url(), cards(b), n))
b.get(BASE + "/vehicles"); b.type("input#q", "Rebel"); b.click("form[action='/vehicles'] button[type=submit]"); b.wait_url("q=Rebel"); time.sleep(0.5)
n = int(sql("select count(*) from vehicles where name ilike '%rebel%' and listing_status='APPROVED' and status='AVAILABLE'"))
check("the search box finds vehicles by name through the form", "q=Rebel" in b.url() and cards(b) == n and n > 0, (b.url(), cards(b), n))
b.get(BASE + "/vehicles?q=zzzz-nothing"); check("a search without results says so", wait_text(b, "no vehicles") or wait_text(b, "nothing") or wait_text(b, "no results"), b.text()[300:500])
b.get(BASE + "/vehicles/does-not-exist"); check("an unknown vehicle shows the 404 page", wait_text(b, "not found") or wait_text(b, "404"))
b.get(BASE + "/account"); check("a visitor who opens /account is sent to the login page", "/login" in b.url(), b.url())

print("== LOGIN")
login(b, "demo.customer@example.com", "wrong-password-1")
check("a wrong password stays on the login page and does not sign in", "/login" in b.url() and "Demo Customer" not in b.text(), b.url())
check("...and the page tells the user", wait_text(b, "invalid") or wait_text(b, "incorrect") or wait_text(b, "wrong"), b.text()[200:400])
login(b, "demo.customer@example.com", DEMO)
check("the right password signs in and shows the user's name", "Demo Customer" in b.text() and "/login" not in b.url(), b.url())
b.get(BASE + "/admin"); check("a customer who opens /admin gets the access-denied page", "/forbidden" in b.url() and "access denied" in b.text().lower(), b.url())

print("== BOOKING (customer)")
vid = sql("select id from vehicles where owner_id is null and listing_status='APPROVED' and status='AVAILABLE' and name='BMW R 1300 GS'")
start = (dt.datetime.now() + dt.timedelta(days=25)).replace(hour=10, minute=0, second=0, microsecond=0)
while start.weekday() >= 5: start += dt.timedelta(days=1)
fmt = lambda d: d.strftime("%Y-%m-%dT%H:%M")
b.get(f"{BASE}/vehicles/{vid}"); time.sleep(2.5)  # let React hydrate: a value typed before that is erased
set_value(b, "input[type=datetime-local]", fmt(start)); b.js(SET_VALUE, {EL: b.finds("input[type=datetime-local]")[1]}, fmt(start + dt.timedelta(hours=3)))
b.type("input[name=phone]", "0700000000"); time.sleep(2)
check("the page shows a price for the chosen period", "RON" in b.js("return document.querySelector('form:has(input[name=fullName])').closest('section,aside,div').innerText"), "")
before = int(sql(f"select count(*) from bookings where vehicle_id='{vid}'"))
click(b, "form:has(input[name=fullName]) button[type=submit]")
check("sending the form creates the booking and opens its page", b.wait_url("/account/bookings/"), b.url())
check("the page confirms 'Booking requested'", wait_text(b, "Booking requested"))
row = sql(f"select status||'|'||to_char(start_at at time zone 'Europe/Bucharest','YYYY-MM-DD HH24:MI') from bookings where vehicle_id='{vid}' and user_id=(select id from users where email='demo.customer@example.com') order by created_at desc limit 1")
check("the row is PENDING and starts at the Bucharest time typed", row == f"PENDING|{start.strftime('%Y-%m-%d %H:%M')}", row)
booking_url = b.url()
b.get(f"{BASE}/vehicles/{vid}"); time.sleep(2.5)
set_value(b, "input[type=datetime-local]", fmt(start + dt.timedelta(hours=1))); b.js(SET_VALUE, {EL: b.finds("input[type=datetime-local]")[1]}, fmt(start + dt.timedelta(hours=2)))
b.type("input[name=phone]", "0700000000"); time.sleep(2)
blocked = "already booked" in b.text().lower() or b.js("return document.querySelector('form:has(input[name=fullName]) button[type=submit]').disabled")
if not "already booked" in b.text().lower(): click(b, "form:has(input[name=fullName]) button[type=submit]"); time.sleep(1.5)
check("an overlapping period is refused with a clear message and no second booking", "already booked" in b.text().lower() and int(sql(f"select count(*) from bookings where vehicle_id='{vid}'")) == before + 1, b.text()[-300:])
b.get(booking_url); time.sleep(1)
el = b.js("return [...document.querySelectorAll('main button')].find(x => x.innerText.trim() === 'Cancel booking')")
b.js("arguments[0].scrollIntoView({block: 'center'})", el); time.sleep(0.4); b.cmd("WebDriver:ElementClick", {"id": el[EL]}); time.sleep(2)
check("the customer cancels the booking from its page", sql(f"select status from bookings where vehicle_id='{vid}' and user_id=(select id from users where email='demo.customer@example.com') order by created_at desc limit 1") == "CANCELLED")
b.close()

print("== MAINTENANCE EDIT (owner)")
b = Browser(download_dir=DL); login(b, "demo.owner@example.com", DEMO)
ov = sql("select v.id from vehicles v join users u on u.id=v.owner_id where u.email='demo.owner@example.com' and v.status='AVAILABLE' order by v.name limit 1")
sql(f"delete from maintenance where vehicle_id='{ov}'")
b.get(f"{BASE}/provider/vehicles/{ov}?tab=maintenance"); time.sleep(2.5)  # values typed before hydration are erased by React
b.js("arguments[0].value = 'SERVICE'", {EL: b.find("select[name=type]")}); set_value(b, "input[name=performedOn]", "2030-03-01"); set_value(b, "input[name=nextDueOn]", "2031-03-01"); b.type("textarea[name=notes]", "browser test entry")
click(b, "form:has(input[name=performedOn]) button[type=submit]"); time.sleep(2)
check("adding a record shows it in the history and the success notice", wait_text(b, "browser test entry") and wait_text(b, "was added"), b.url())
click(b, "a[aria-label='Edit record']"); time.sleep(3)
check("the pencil opens the edit form prefilled with the record", wait_text(b, "Edit the record") and b.js("return document.querySelector('input[name=performedOn]').value") == "2030-03-01" and "browser test entry" in b.js("return document.querySelector('textarea[name=notes]').value"))
set_value(b, "textarea[name=notes]", "edited in the browser"); set_value(b, "input[name=nextDueOn]", "2030-02-01")
click(b, "form:has(input[name=recordId][type=hidden]):has(input[name=performedOn]) button[type=submit]"); time.sleep(2)
check("a deadline before the date done is refused with a message and the row is unchanged", wait_text(b, "next deadline must be after") and sql(f"select notes from maintenance where vehicle_id='{ov}'") == "browser test entry", b.text()[:200])
b.get(b.url()); b.get(f"{BASE}/provider/vehicles/{ov}?tab=maintenance")
rec = sql(f"select id from maintenance where vehicle_id='{ov}'"); b.get(f"{BASE}/provider/vehicles/{ov}?tab=maintenance&edit={rec}"); time.sleep(2.5)
set_value(b, "textarea[name=notes]", "edited in the browser"); set_value(b, "input[name=nextDueOn]", "2031-06-01")
click(b, "form:has(input[name=recordId][type=hidden]):has(input[name=performedOn]) button[type=submit]"); time.sleep(2)
check("saving a valid edit updates the same row and shows the notice", sql(f"select notes||'|'||count(*) from maintenance where vehicle_id='{ov}' group by notes") == "edited in the browser|1" and wait_text(b, "was saved"), (sql(f"select notes||'|'||next_due_at from maintenance where vehicle_id='{ov}'"), b.url(), [l for l in b.text().splitlines() if "record" in l.lower()][:4]))

print("== CSV DOWNLOADS")
login(b, *ADMIN); b.get(BASE + "/admin/finance")
today = dt.date.today()
data, name = download(b, "form[action='/admin/finance/export'] button[type=submit]")
n_all = int(sql("select count(*) from bookings where status='COMPLETED'"))
rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig")))) if data else []
check("the admin's download button saves completed-bookings.csv with a BOM, the header and all completed bookings", data is not None and name == "completed-bookings.csv" and data.startswith(b"\xef\xbb\xbf") and rows[0][0] == "booking" and len(rows) - 1 == n_all, (name, len(rows)))
set_value(b, "form[action='/admin/finance/export'] input[name=from]", "2099-01-01"); set_value(b, "form[action='/admin/finance/export'] input[name=to]", "2099-12-31")
data, name = download(b, "form[action='/admin/finance/export'] button[type=submit]")
check("a range with no bookings downloads only the header", data is not None and len(data.decode("utf-8-sig").strip().splitlines()) == 1, name)
login(b, "demo.owner@example.com", DEMO); b.get(BASE + "/provider/finance")
data, name = download(b, "form[action='/provider/finance/export'] button[type=submit]")
own = int(sql("select count(*) from bookings bk join vehicles v on v.id=bk.vehicle_id join users u on u.id=v.owner_id where u.email='demo.owner@example.com' and bk.status='COMPLETED'"))
rows = list(csv.reader(io.StringIO(data.decode("utf-8-sig")))) if data else []
check("the owner's download has only the owner's completed bookings", data is not None and name == "my-completed-bookings.csv" and len(rows) - 1 == own and own > 0 and all(r[3] == "Demo Owner" for r in rows[1:]), (name, len(rows), own))
b.close()

print("== PAGE WIDTH AT 390 PX (iframe of the exact width; the window itself cannot be narrower than 500 px)")
PROBE = """
const [path, width, done] = arguments;
const f = document.createElement('iframe');
f.style.cssText = 'position:fixed;left:0;top:0;border:0;width:' + width + 'px;height:800px';
fetch(path, {credentials: 'same-origin'}).then(r => r.text()).then(html => { f.srcdoc = html.replace('<head>', '<head><base href="' + location.origin + '/">'); });
f.onload = () => setTimeout(() => { const de = f.contentDocument.documentElement; done({scroll: de.scrollWidth, inner: f.contentWindow.innerWidth}); f.remove(); }, 700);
document.body.appendChild(f);
"""
vehicle = sql("select id from vehicles where listing_status='APPROVED' order by name limit 1")
PAGES = {("demo.customer@example.com", DEMO): ["/", "/vehicles", "/vehicles?type=ATV", f"/vehicles/{vehicle}", "/login", "/register", "/account", "/account/bookings", "/account/profile"],
         ("demo.owner@example.com", DEMO): ["/provider", "/provider/vehicles", f"/provider/vehicles/{ov}?tab=maintenance", f"/provider/vehicles/{ov}?tab=details", "/provider/bookings", "/provider/calendar", "/provider/finance"],
         (ADMIN[0], ADMIN[1]): ["/admin", "/admin/bookings", "/admin/vehicles", "/admin/maintenance", "/admin/finance", "/admin/users", "/admin/payouts", "/admin/locations", "/admin/quotes"]}
for (email, pw), paths in PAGES.items():
    b = Browser((500, 900)); login(b, email, pw)
    for p in paths:
        b.get(BASE + "/login") if p != "/login" else b.get(BASE + "/vehicles")
        r = b.cmd("WebDriver:ExecuteAsyncScript", {"script": PROBE, "args": [p, 390]})["value"]
        check(f"{email.split('@')[0]:14} {p[:44]:44} fits in 390 px (page {r['scroll']} px, window {r['inner']} px)", r["scroll"] <= r["inner"], r)
    b.close()
print("FAILS:", FAILS)
sys.exit(1 if FAILS else 0)
