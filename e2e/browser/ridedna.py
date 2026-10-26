"""Real-browser checks of RideDNA (headless Firefox through Marionette): the questionnaire, the results, the choice of dates,
the hand-over to the normal booking and the layout at 390 px. Needs the app on $BASE on the TEST database with the demo data;
use ./e2e/browser/run.sh."""
import datetime as dt, os, re, sys, time, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from helpers import ADMIN, BASE, DEMO, DL, EL, SET_VALUE, Browser, FAILS, check, click, login, set_value, sql, wait_text


def pick(b, value):
    """Choose an option card the way a person does: click its label."""
    css = f"label:has(input[value='{value}'])"
    b.js("arguments[0].scrollIntoView({block: 'center'})", {EL: b.find(css)}); time.sleep(0.2); b.click(css)
def press(b, label):
    el = b.js("return [...document.querySelectorAll('main button')].find(x => x.innerText.trim().startsWith(arguments[0]))", label)
    b.js("arguments[0].scrollIntoView({block: 'center'})", el); time.sleep(0.2); b.cmd("WebDriver:ElementClick", {"id": el[EL]})
def step_title(b): return b.js("return document.getElementById('quiz-title').innerText")
def progress(b): return b.js("return document.querySelector('[role=progressbar]').getAttribute('aria-valuenow')")
def checked(b, value): return b.js("const e = document.querySelector(`input[value='${arguments[0]}']`); return !!e && e.checked", value)

print("== RIDEDNA QUESTIONNAIRE")
b = Browser()
b.get(BASE + "/"); click(b, "a[href='/ridedna'][class*=ghost], a[href='/ridedna']"); b.wait_url("/ridedna"); time.sleep(2)
check("the home page links to RideDNA and the page opens with the first question", "Find the ride that fits you" in b.text() and "How much do you ride?" in step_title(b), b.url())
check("the header has a RideDNA entry", b.js("return !!document.querySelector('header a[href=\"/ridedna\"]')"))
press(b, "Continue"); time.sleep(0.4)
check("Continue without an answer stays on the step and says what to do", "How much do you ride?" in step_title(b) and wait_text(b, "Choose the option that describes you best"), step_title(b))
pick(b, "INTERMEDIATE"); press(b, "Continue"); time.sleep(0.5)
check("a valid answer moves to step 2 and the progress bar follows", "licence" in step_title(b).lower() and progress(b) == "2")
check("the focus moves to the new question (keyboard and screen-reader users)", b.js("return document.activeElement.id") == "quiz-title")
pick(b, "A2"); press(b, "Back"); time.sleep(0.4)
check("Back keeps the earlier answer", checked(b, "INTERMEDIATE") and progress(b) == "1")
press(b, "Continue"); time.sleep(0.4)
check("...and the answer of the step we left", checked(b, "A2"))
press(b, "Continue"); time.sleep(0.4)
pick(b, "MIXED_TRAILS"); press(b, "Continue"); time.sleep(0.4)
pick(b, "EXPLORATION"); pick(b, "COMFORT")
check("at most two priorities: the third option is disabled", b.js("const e = document.querySelector(\"input[value='SPORT']\"); return e.disabled"))
press(b, "Continue"); time.sleep(0.4)
pick(b, "WEEKEND"); press(b, "Continue"); time.sleep(0.4)
set_value(b, "#budget", "10"); press(b, "Continue"); time.sleep(0.4)
check("a budget below the minimum is refused with the limits", wait_text(b, "between 50 and 100000 RON") and "budget" in step_title(b).lower())
check("the budget field only takes digits", (set_value(b, "#budget", "12ab"), b.js("return document.getElementById('budget').value"))[1] == "12")
set_value(b, "#budget", "1500"); press(b, "Continue"); time.sleep(0.6)
check("the summary shows the profile chosen by the rules and the answers", "Your RideDNA" in step_title(b) and "Trail Seeker" in b.text() and "Category A2" in b.text() and "Exploring far, Comfort" in b.text(), b.text()[400:700])
press(b, "Show my recommendations"); time.sleep(0.4)
check("the recommendations cannot be requested without the confirmation", wait_text(b, "confirm the note") and "/results" not in b.url())
b.get(BASE + "/ridedna"); time.sleep(2)
check("a reload in the same tab restores the unfinished answers", "Your RideDNA" in step_title(b) and "Trail Seeker" in b.text(), step_title(b))
click(b, "button[aria-label='Change budget']"); time.sleep(0.5)
check("a 'Change' link goes back to that question", "budget" in step_title(b).lower() and b.js("return document.getElementById('budget').value") == "1500")
press(b, "Continue"); time.sleep(0.5)
click(b, "input[type=checkbox]"); time.sleep(0.2)
press(b, "Start over"); time.sleep(0.5)
check("Start over clears everything and returns to the first question", "How much do you ride?" in step_title(b) and not checked(b, "INTERMEDIATE") and progress(b) == "1")
b.get(BASE + "/ridedna"); time.sleep(2)
check("...and nothing is restored afterwards", "How much do you ride?" in step_title(b) and not checked(b, "INTERMEDIATE"))
b.cmd("WebDriver:ElementSendKeys", {"id": b.find("input[value='ADVANCED']"), "text": " "}); time.sleep(0.3)
check("an option can be chosen from the keyboard", checked(b, "ADVANCED"))
b.close()

print("== RIDEDNA RESULTS, DATES AND BOOKING")
Q = dict(exp="INTERMEDIATE", lic="A2", adv="MIXED_TRAILS", pri="EXPLORATION,COMFORT", bud="3000", dur="WEEKEND", pax="1", ack="1")
def url(**over): return BASE + "/ridedna/results?" + urllib.parse.urlencode({**Q, **over})
def cards_of(b): return b.js("return [...document.querySelectorAll('article[aria-labelledby^=rec-]')].map(a => ({name: a.querySelector('h3').innerText, score: +a.querySelector('[role=meter]').getAttribute('aria-valuenow'), price: a.querySelector('.text-2xl').innerText.trim(), choose: [...a.querySelectorAll('a')].find(x => x.innerText.trim() === 'Choose this vehicle').getAttribute('href'), text: a.innerText}))")
today = dt.date.today()
ymd = lambda d: d.strftime("%Y-%m-%d")

b = Browser()
b.get(url()); time.sleep(3)
rec = cards_of(b)
check("the results show the profile and three distinct recommendations, best score first", "Trail Seeker" in b.text() and len(rec) == 3 and len({r["name"] for r in rec}) == 3 and [r["score"] for r in rec] == sorted([r["score"] for r in rec], reverse=True), [(r["name"], r["score"]) for r in rec])
check("every recommended vehicle is a real, approved, available vehicle of the database", all(sql(f"select count(*) from vehicles where name='{r['name']}' and listing_status='APPROVED' and status='AVAILABLE'") == "1" for r in rec))
check("each card explains the match with stored facts, shows a label and a price, and two buttons", all("Why it fits you" in r["text"] and re.search(r"(Excellent|Good|Fair|Possible) match", r["text"]) and "RON" in r["price"] and "View details" in r["text"] for r in rec))
check("the specifications shown equal the database (power of the first vehicle)", (lambda hp: hp == "" or f"{hp} hp" in rec[0]["text"])(sql(f"select coalesce(power_hp::text,'') from vehicles where name='{rec[0]['name']}'")))
check("a comparison table lists the three vehicles", b.js("return document.querySelectorAll('table thead th').length") == 4 and "Side by side" in b.text())
check("without a day the page says availability is not checked yet and the price is an estimate", "Availability is checked once you choose a day" in b.text() and "Estimate for a weekday trip" in b.text())
first_scores = [(r["name"], r["score"]) for r in rec]
b.get(url()); time.sleep(3)
check("the same answers give the same result on a second visit", [(r["name"], r["score"]) for r in cards_of(b)] == first_scores)

b.get(url(lic="NONE", adv="ROAD_TOURING")); time.sleep(3)
check("when nothing fits, the page says so, lists the reasons and does not invent vehicles", cards_of(b) == [] and "None of our vehicles fits all your answers" in b.text() and "needs a motorcycle licence" in b.text())
b.get(url(bud="50")); time.sleep(3)
check("a budget below every price says which vehicles fit except for the budget, and the cheapest price", cards_of(b) == [] and "fit everything except the budget" in b.text() and "cheapest costs about" in b.text())
for bad in ("exp=NOPE", ""):
    b.get(BASE + "/ridedna/results?" + bad); time.sleep(1.5)
    check(f"invalid answers in the address ({bad or 'none'}) lead back to the questionnaire", "We need your answers first" in b.text())
b.get(url(start="2020-01-01")); time.sleep(2.5)
check("a day in the past is refused with a message and no recommendations", "already started or passed" in b.text() and cards_of(b) == [])

sql("update vehicles set status='IN_SERVICE' where type='ATV' and name not in ('Yamaha Grizzly 700','Polaris Sportsman 570')")
b.get(url(adv="ATV_RECREATION", exp="ADVANCED", lic="NONE", pri="COMFORT")); time.sleep(3)
two = cards_of(b)
check("with only two fitting vehicles it shows two and says why, and never a vehicle in service", len(two) == 2 and "Only 2 vehicles fit your answers" in b.text() and {r["name"] for r in two} == {"Yamaha Grizzly 700", "Polaris Sportsman 570"}, [r["name"] for r in two])
sql("update vehicles set status='AVAILABLE' where type='ATV'")

print("-- dates, price and the hand-over to the booking")
day = today + dt.timedelta(days=40)
b.get(url()); time.sleep(2.5)
set_value(b, "#rd-start", ymd(day)); click(b, "form[action='/ridedna/results'] button[type=submit]"); b.wait_url("start="); time.sleep(3)
rec = cards_of(b)
check("choosing a day shows the exact-price note and that the vehicles are free", len(rec) > 0 and "Price for your dates" in b.text() and "Free for your dates right now" in b.text() and f"from {ymd(day)} 09:00" in b.text(), b.url())
top = rec[0]
vid = top["choose"].split("/vehicles/")[1].split("?")[0]
check("'Choose this vehicle' carries the exact period to the vehicle page", f"start={ymd(day)}T09:00" in top["choose"] and top["choose"].endswith("#book"), top["choose"])

# another customer takes the first vehicle for part of the period before our user decides
cust = sql("select id from customers limit 1")
start_utc = sql(f"select (timestamp '{ymd(day)} 10:00' at time zone 'Europe/Bucharest')::text")
sql(f"insert into bookings(id, vehicle_id, customer_id, start_at, end_at, status, total_price) values ('rd-race-1', '{vid}', '{cust}', '{start_utc}'::timestamptz, '{start_utc}'::timestamptz + interval '2 hours', 'CONFIRMED', 100)")
b.get(BASE + top["choose"]); time.sleep(3)
check("a visitor who chooses a vehicle is asked to log in, and the day travels with the login link", "to book this vehicle" in b.text() and urllib.parse.quote(f"start={ymd(day)}T09:00", safe="") in b.js("return document.querySelector('#book a[href^=\"/login\"]').getAttribute('href')"), b.url())
login(b, "demo.customer@example.com", DEMO)
b.get(BASE + top["choose"]); time.sleep(3.5)
check("the booking form opens with the period filled in", b.js("return document.getElementById('startAt').value") == f"{ymd(day)}T09:00", b.js("return [document.getElementById('startAt').value, document.getElementById('endAt').value]"))
check("a vehicle that became booked in between is reported as booked and cannot be requested", wait_text(b, "Already booked for part of this period") and b.js("return [...document.querySelectorAll('form button')].find(x => x.innerText.includes('Request booking')).disabled"))
sql("delete from bookings where id='rd-race-1'")

b.get(url(start=ymd(day))); time.sleep(3)
rec = cards_of(b)
second = [r for r in rec if r["name"] == top["name"]][0] if any(r["name"] == top["name"] for r in rec) else rec[0]
vid2 = second["choose"].split("/vehicles/")[1].split("?")[0]
b.get(BASE + second["choose"]); time.sleep(3.5)
check("the price in the booking form equals the price on the card", wait_text(b, "Free for this period") and second["price"] in b.js("return document.getElementById('estimate').innerText"), (second["price"], b.js("return document.getElementById('estimate').innerText")))
set_value(b, "#phone", "0700000000"); time.sleep(0.5)
click(b, "form:has(input[name=fullName]) button[type=submit]")
check("sending the form creates the real booking through the normal flow", b.wait_url("/account/bookings/") and wait_text(b, "Booking requested"), b.url())
row = sql(f"select status||'|'||total_price from bookings where vehicle_id='{vid2}' and user_id=(select id from users where email='demo.customer@example.com') order by created_at desc limit 1")
expected = int(re.sub(r"\D", "", second["price"])) * 100
check("the booking is PENDING and its price is the one shown (recalculated by the server)", row == f"PENDING|{expected}", (row, second["price"]))
sql(f"update bookings set status='CANCELLED' where vehicle_id='{vid2}' and status='PENDING'")
b.close()

print("== RIDEDNA ON A PHONE")
PROBE = """
const [path, width, done] = arguments;
const f = document.createElement('iframe');
f.style.cssText = 'position:fixed;left:0;top:0;border:0;width:' + width + 'px;height:800px';
fetch(path, {credentials: 'same-origin'}).then(r => r.text()).then(html => { f.srcdoc = html.replace('<head>', '<head><base href="' + location.origin + '/">'); });
f.onload = () => setTimeout(() => { const de = f.contentDocument.documentElement; done({scroll: de.scrollWidth, inner: f.contentWindow.innerWidth}); f.remove(); }, 700);
document.body.appendChild(f);
"""
b = Browser((500, 900))
for p in ["/ridedna", "/ridedna/results?" + urllib.parse.urlencode(Q), "/ridedna/results?" + urllib.parse.urlencode({**Q, "lic": "NONE", "adv": "ROAD_TOURING"})]:
    b.get(BASE + "/login")
    r = b.cmd("WebDriver:ExecuteAsyncScript", {"script": PROBE, "args": [p, 390]})["value"]
    check(f"{p[:60]:60} fits in 390 px (page {r['scroll']} px)", r["scroll"] <= r["inner"], r)
b.close()
print("FAILS:", FAILS)
sys.exit(1 if FAILS else 0)
