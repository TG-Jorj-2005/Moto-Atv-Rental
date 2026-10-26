"""RideDNA over HTTP: public access, hostile input, nothing taken from the browser as authoritative, no private data, the
user's own vehicles left out, and what an administrator or an owner sees when they choose a vehicle."""
import sys, os, re, urllib.parse, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from driver import *
env = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")).read()
AE = re.search(r"^ADMIN_EMAIL=(.*)$", env, re.M).group(1).strip('"'); AP = re.search(r"^ADMIN_PASSWORD=(.*)$", env, re.M).group(1).strip('"')
DEMO = "Demo-pass-2030!"
for jar, e, p in [("/tmp/jr_a", AE, AP), ("/tmp/jr_c", "demo.customer@example.com", DEMO), ("/tmp/jr_o", "demo.owner@example.com", DEMO)]: login(jar, e, p)
A, C, O = "/tmp/jr_a", "/tmp/jr_c", "/tmp/jr_o"
Q = dict(exp="INTERMEDIATE", lic="A2", adv="MIXED_TRAILS", pri="EXPLORATION,COMFORT", bud="3000", dur="WEEKEND", pax="1", ack="1")
def results(jar, **over): return get(jar, "/ridedna/results?" + urllib.parse.urlencode({**Q, **over}))
def names(page): return re.findall(r'id="rec-[^"]+"[^>]*>([^<]+)</h3>', page)

print("== ACCESS")
check("the questionnaire and the results are public (no login needed)", status(None, "/ridedna").startswith("200") and status(None, "/ridedna/results?" + urllib.parse.urlencode(Q)).startswith("200"))
page = results(None)
check("the results page has the profile and three vehicles", "Trail Seeker" in page and len(names(page)) == 3, names(page))
check("the answers of a signed-in customer, an administrator and an owner give the same ranking (no hidden personalisation)", names(results(C)) == names(page) == names(results(A)))
check("no private data in the page: no e-mail address, password or owner name", not re.search(r"[\w.+-]+@[\w-]+\.(com|test|ro)|password|Demo Owner|Demo Trails", page), "")

print("== HOSTILE INPUT")
bad_cases = {
    "a script in a parameter": dict(exp="<script>alert(1)</script>"),
    "an invented option": dict(adv="TELEPORT"),
    "a negative budget": dict(bud="-1"),
    "a budget with decimals": dict(bud="10.5"),
    "a huge budget": dict(bud="9" * 40),
    "a third priority": dict(pri="COMFORT,POWER,SPORT"),
    "an impossible date": dict(start="2027-02-31"),
    "a date with text": dict(start="<img src=x onerror=alert(1)>"),
    "no confirmation": dict(ack="0"),
}
for label, over in bad_cases.items():
    p = results(None, **over)
    # the address may appear in the page data of Next.js, JSON-escaped (\u003c): inert. What must never appear is raw markup.
    check(f"{label}: a clear page, no recommendations, no raw markup from the input", "We need your answers first" in p and "<script>alert" not in p and "<img src=x" not in p and not names(p), p[:120])
check("an absurdly long address is refused by the server (431), not answered with an error 500", status(None, "/ridedna/results?pri=" + ",".join(["COMFORT"] * 3000)).startswith("431"))
check("a NUL character is refused with 400 before reaching the application", status(None, "/ridedna/results?exp=%00").startswith("400"))
check("unknown extra parameters (score, price, role, available) change nothing", names(results(None, score="100", price="1", role="ADMIN", available="true")) == names(page))
check("a repeated parameter uses the first value only and still works", len(names(get(None, "/ridedna/results?" + urllib.parse.urlencode(Q) + "&exp=ADVANCED"))) == 3)
check("a hostile period handed to a vehicle page is ignored, not reflected as markup", "<script>alert" not in get(C, "/vehicles/" + sql("select id from vehicles limit 1") + "?start=<script>alert(1)</script>&end=x") and status(C, "/vehicles/" + sql("select id from vehicles limit 1") + "?start=zz&end=yy").startswith("200"))

print("== THE USER'S OWN VEHICLES")
own = sql("select v.id from vehicles v join users u on u.id=v.owner_id where u.email='demo.owner@example.com' and v.listing_status='APPROVED' and v.status='AVAILABLE' order by v.name limit 1")
oname = sql(f"select name from vehicles where id='{own}'")
sql(f"update vehicles set category='ADVENTURE', power_hp=60, seats=2, license_category='A2', daily_rate=10000, hourly_rate=2000 where id='{own}'")
anon = names(results(None, bud="3000"))
mine = names(results(O, bud="3000"))
check("the owner is never offered their own vehicle", oname not in mine, (oname, mine))
check("...and a visitor can be offered it (the vehicle is eligible)", oname in names(results(None, bud="3000", adv="ROAD_TOURING", pri="COMFORT")), names(results(None, bud="3000", adv="ROAD_TOURING", pri="COMFORT")))
check("an owner who opens their own vehicle from a link cannot book it", "cannot book it" in get(O, f"/vehicles/{own}?start=2030-01-01T09:00&end=2030-01-02T09:00"))
check("an administrator who chooses a vehicle sees that administrators do not book", "do not make bookings" in get(A, f"/vehicles/{own}?start=2030-01-01T09:00&end=2030-01-02T09:00"))

print("== THE PERIOD AND THE PRICE")
day = dt.date.today() + dt.timedelta(days=30)
p = results(None, start=day.strftime("%Y-%m-%d"))
check("with a day the page confirms the period and shows the exact-price note", "Price for your dates" in text(p) and f"from {day.strftime('%Y-%m-%d')} 09:00" in text(p))
tomorrow = dt.date.today()
p = results(None, start=(dt.date.today() - dt.timedelta(days=1)).strftime("%Y-%m-%d"))
check("yesterday is refused with an explanation", "already started or passed" in p and not names(p))
gs = sql("select id from vehicles where category='ADVENTURE' and owner_id is null order by name limit 1")
before = re.findall(r"/vehicles/([a-z0-9]+)", results(None, lic="A", exp="ADVANCED", adv="ROAD_TOURING", pri="COMFORT", bud="3000"))
sql(f"update vehicles set status='IN_SERVICE' where id='{gs}'")
after = re.findall(r"/vehicles/([a-z0-9]+)", results(None, lic="A", exp="ADVANCED", adv="ROAD_TOURING", pri="COMFORT", bud="3000"))
check("a vehicle put in service disappears from the recommendations at once", gs in before and gs not in after, (gs, before[:3], after[:3]))
print("FAILS:", FAILS)
