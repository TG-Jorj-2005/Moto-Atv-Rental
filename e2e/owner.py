import sys, os, re, glob
sys.path.insert(0, os.path.dirname(__file__))
from driver import *
S = os.path.dirname(__file__)
UP = os.environ["E2E_UPLOAD_DIR"]
TMP = os.environ["E2E_TMP"]
DEMO = "Demo-pass-2030!"
for jar, email in [("/tmp/j_own", "demo.owner@example.com"), ("/tmp/j_co", "demo.company@example.com"), ("/tmp/j_cust", "demo.customer@example.com")]:
    login(jar, email, DEMO)
J = "/tmp/j_own"
loc = sql("select id from locations where name='Cluj Hills'")
print("== OWNER: creating a listing")
page = get(J, "/provider/vehicles/new")
f = find_form(page, has=["name", "plate", "hourlyRon"])
base = {"name": "Polaris RZR 570 (UI test)", "type": "ATV", "plate": "ui-001", "locationId": loc, "hourlyRon": "120", "dailyRon": "480", "weekendRon": "800", "year": "2023", "engineCc": "570", "powerHp": "44", "seats": "2", "licenseCategory": "", "category": "ATV_UTILITY", "description": "Created by the UI flow test."}
r = submit(J, "/provider/vehicles/new", f, {**base, "hourlyRon": "0"})
check("price 0 is refused", "error=invalid" in r, r)
r = submit(J, "/provider/vehicles/new", f, {**base, "name": "ab"})
check("a too short name is refused", "error=invalid" in r, r)
r = submit(J, "/provider/vehicles/new", f, base)
m = re.search(r"/provider/vehicles/([a-z0-9]+)\?tab=photos&ok=created", r)
check("a valid listing is created and the owner lands on its photos tab", m is not None, r)
vid = m.group(1)
row = sql(f"select listing_status||'|'||owner_id||'|'||plate||'|'||hourly_rate||'|'||daily_rate||'|'||weekend_rate||'|'||year||'|'||engine_cc||'|'||power_hp||'|'||seats from vehicles where id='{vid}'")
owner_id = sql("select id from users where email='demo.owner@example.com'")
check("it starts PENDING, belongs to the owner, plate upper-cased, prices stored in bani, specs saved", row == f"PENDING|{owner_id}|UI-001|12000|48000|80000|2023|570|44|2", row)
check("it is not visible to the public until approved", status(None, f"/vehicles/{vid}").startswith("404"))
r = submit(J, "/provider/vehicles/new", f, base)
r = submit(J, "/provider/vehicles/new", f, {**base, "plate": "ui-002", "category": "CRUISER"})
check("a category that does not fit the type is refused (a cruiser quad)", "error=category" in r and sql("select count(*) from vehicles where plate='UI-002'") == "0", r)
check("the category error is explained on the page", "does not fit" in text(get(J, "/provider/vehicles/new?error=category")))
check("a fitting category is stored", sql(f"select category from vehicles where id='{vid}'") == "ATV_UTILITY")
r = submit(J, "/provider/vehicles/new", f, base)
check("a duplicate plate is refused with a clear error", "error=plate" in r, r)
check("the error is shown on the page", "already exists" in text(get(J, "/provider/vehicles/new?error=plate")))

print("== OWNER: photos")
tab = get(J, f"/provider/vehicles/{vid}?tab=photos")
up = find_form(tab, has=["vehicleId", "returnTo"], contains="Upload")
gallery = os.path.join(os.path.dirname(S), "public", "gallery")
r = submit(J, f"/provider/vehicles/{vid}", up, files=[("photos", f"{gallery}/g4.jpg")])
check("a JPEG is uploaded", "ok=photos" in r and sql(f"select count(*) from vehicle_photos where vehicle_id='{vid}'") == "1", r)
path = sql(f"select path from vehicle_photos where vehicle_id='{vid}' order by position limit 1")
name = path.split("/")[-1]
check("it is stored under a random name inside the upload folder", re.fullmatch(r"uploads/[0-9a-f]{32}\.jpg", path) is not None and os.path.exists(os.path.join(UP, name)), path)
served = subprocess.run(["curl", "-s", "-D", "-", "-o", "/tmp/served.bin", f"{BASE}/{path}"], capture_output=True, text=True).stdout
check("the photo is served with the right type and unchanged bytes", "200" in served.splitlines()[0] and "image/jpeg" in served and open("/tmp/served.bin", "rb").read() == open(f"{gallery}/g4.jpg", "rb").read())
check("nosniff and long cache headers are set", "x-content-type-options: nosniff" in served.lower() and "immutable" in served.lower())
for bad in ["/uploads/..%2f..%2f..%2fetc%2fpasswd", "/uploads/%2e%2e/%2e%2e/etc/passwd", "/uploads/x.html", "/uploads/ffffffffffffffffffffffffffffffff.svg", "/uploads/nothere0123456789012345678901234.jpg", "/uploads/a/b.jpg"]:
    check(f"path trick {bad} is a 404", status(None, bad).startswith("404"), status(None, bad))
r = submit(J, f"/provider/vehicles/{vid}", up, files=[("photos", f"{TMP}/fake.jpg")])
check("a text file renamed .jpg is refused", "error=photo_NOT_AN_IMAGE" in r, r)
r = submit(J, f"/provider/vehicles/{vid}", up, files=[("photos", f"{TMP}/big.jpg")])
check("a photo over 5 MB is refused by the service", "error=photo_TOO_BIG" in r, r)
r = submit(J, f"/provider/vehicles/{vid}", up, files=[("photos", f"{gallery}/g1.jpg"), ("photos", f"{gallery}/g2.jpg")])
check("two more photos are added", "ok=photos" in r and sql(f"select count(*) from vehicle_photos where vehicle_id='{vid}'") == "3", r)
check("refused files left nothing on disk", len(os.listdir(UP)) == 3, str(os.listdir(UP)))
tab = get(J, f"/provider/vehicles/{vid}?tab=photos")
second = sql(f"select id from vehicle_photos where vehicle_id='{vid}' and position=1")
cover = find_form(tab, has=["photoId"], contains="Make cover")
r = submit(J, f"/provider/vehicles/{vid}", cover, {"photoId": second})
check("a photo is made the cover", sql(f"select position from vehicle_photos where id='{second}'") == "0" and "ok=cover" in r, r)
tab = get(J, f"/provider/vehicles/{vid}?tab=photos")
rm = find_form(tab, has=["photoId"], contains="Remove")
victim = rm["fields"][[n for n, _, _ in rm["fields"]].index("photoId")][1]
vpath = sql(f"select path from vehicle_photos where id='{victim}'")
r = submit(J, f"/provider/vehicles/{vid}", rm)
check("a photo is removed with its file", sql(f"select count(*) from vehicle_photos where vehicle_id='{vid}'") == "2" and not os.path.exists(os.path.join(UP, vpath.split('/')[-1])) and "ok=photo_deleted" in r, r)
check("positions stay contiguous", sql(f"select string_agg(position::text, ',' order by position) from vehicle_photos where vehicle_id='{vid}'") == "0,1")

print("== OWNER: editing an approved listing and maintenance")
mine = sql(f"select id from vehicles where owner_id='{owner_id}' and listing_status='APPROVED' limit 1")
page = get(J, f"/provider/vehicles/{mine}?tab=details")
ed = find_form(page, has=["name", "hourlyRon", "vehicleId"])
vals = {n: v for n, v, t in ed["fields"] if t not in ("hidden",) and n != "__selected__"}
r = submit(J, f"/provider/vehicles/{mine}", ed, {"category": "ADVENTURE"})
check("an owner cannot give a quad a motorcycle category when editing", "error=category" in r, r)
r = submit(J, f"/provider/vehicles/{mine}", ed, {"category": "ATV_SPORT", "dailyRon": "455"})
check("an owner can set a fitting category when editing", sql(f"select category from vehicles where id='{mine}'") == "ATV_SPORT", r)
r = submit(J, f"/provider/vehicles/{mine}", ed, {"dailyRon": "455"})
check("a price change keeps the listing approved", "ok=saved" in r and "saved_review" not in r and sql(f"select daily_rate||'|'||listing_status from vehicles where id='{mine}'") == "45500|APPROVED", r)
r = submit(J, f"/provider/vehicles/{mine}", ed, {"description": "A brand new description of this vehicle."})
check("a text change sends it back to approval", "ok=saved_review" in r and sql(f"select listing_status from vehicles where id='{mine}'") == "PENDING", r)
check("and the page says so", "awaiting approval" in text(get(J, f"/provider/vehicles/{mine}?tab=details&ok=saved_review")).lower())
mt = get(J, f"/provider/vehicles/{mine}?tab=maintenance")
add = find_form(mt, has=["type", "performedOn", "nextDueOn"])
r = submit(J, f"/provider/vehicles/{mine}", add, {"type": "SERVICE", "performedOn": "2026-10-01", "nextDueOn": "2026-09-01"})
check("a deadline before the date done is refused", "error=maintenance_dates" in r, r)
r = submit(J, f"/provider/vehicles/{mine}", add, {"type": "SERVICE", "performedOn": "2026-02-30", "nextDueOn": ""})
check("an impossible date is refused", "error=maintenance_invalid" in r, r)
before = sql(f"select count(*) from maintenance where vehicle_id='{mine}'")
r = submit(J, f"/provider/vehicles/{mine}", add, {"type": "SERVICE", "performedOn": "2026-10-01", "nextDueOn": "2027-10-01", "notes": "Oil and filters"})
check("a service record is added", "ok=maintenance" in r and int(sql(f"select count(*) from maintenance where vehicle_id='{mine}'")) == int(before) + 1, r)
check("it never touches bookings or the vehicle status", sql(f"select status from vehicles where id='{mine}'") == "AVAILABLE")
mt = get(J, f"/provider/vehicles/{mine}?tab=maintenance")
dele = find_form(mt, has=["recordId"], contains="")
rid = dele["fields"][[n for n, _, _ in dele["fields"]].index("recordId")][1]
r = submit(J, f"/provider/vehicles/{mine}", dele)
check("a record is removed", sql(f"select count(*) from maintenance where id='{rid}'") == "0", r)
rej = sql(f"select id from vehicles where owner_id='{owner_id}' and listing_status='REJECTED' limit 1")
page = get(J, f"/provider/vehicles/{rej}")
check("a rejected listing offers to send it for approval again", "Send for approval again" in text(page))
rs = find_form(page, has=["vehicleId"], contains="Send for approval again")
r = submit(J, f"/provider/vehicles/{rej}", rs)
check("resubmitting puts it back to PENDING", sql(f"select listing_status from vehicles where id='{rej}'") == "PENDING", r)

print("== OWNER: other people's vehicles do not exist")
other = sql("select id from vehicles where owner_id=(select id from users where email='demo.company@example.com') limit 1")
check("opening a company vehicle is a 404", status(J, f"/provider/vehicles/{other}").startswith("404"))
before = sql(f"select name||'|'||daily_rate from vehicles where id='{other}'")
r = submit(J, f"/provider/vehicles/{mine}", ed, {"vehicleId": other, "name": "HACKED NAME", "dailyRon": "1"})
check("an edit aimed at another owner's vehicle changes nothing", sql(f"select name||'|'||daily_rate from vehicles where id='{other}'") == before and "error=notfound" in r, r)
r = submit(J, f"/provider/vehicles/{mine}", find_form(get(J, f"/provider/vehicles/{mine}?tab=photos"), has=["vehicleId", "returnTo"], contains="Upload"), {"vehicleId": other}, files=[("photos", f"{gallery}/g2.jpg")])
check("uploading photos to another owner's vehicle is refused", sql(f"select count(*) from vehicle_photos where vehicle_id='{other}' and path like 'uploads/%'") == "0" and "error=photo_NOT_FOUND" in r, r)
cp = sql(f"select id from vehicle_photos where vehicle_id='{other}' limit 1")
r = submit(J, f"/provider/vehicles/{mine}", find_form(get(J, f"/provider/vehicles/{vid}?tab=photos"), has=["photoId"], contains="Remove"), {"photoId": cp})
check("removing another owner's photo is refused", sql(f"select count(*) from vehicle_photos where id='{cp}'") == "1", r)
check("the other owner's bookings are not in my list", "Honda CRF450L" not in text(get(J, "/provider/bookings")))
check("the other owner's money is not in my earnings page", "Demo Trails" not in text(get(J, "/provider/finance")))
check("the calendar rejects a made-up vehicle filter without leaking", status(J, f"/provider/calendar?vehicle={other}").startswith("200") and "Honda CRF450L" not in text(get(J, f"/provider/calendar?vehicle={other}")))

print("== OWNER: bookings, calendar, earnings")
bk = text(get(J, "/provider/bookings"))
check("bookings show only my vehicles, customer names and my share", "Yamaha Raptor 700" in bk and "Your share" in bk)
check("filters work", "No bookings found" in text(get(J, "/provider/bookings?status=ACTIVE")) or "Yamaha Raptor 700" not in text(get(J, "/provider/bookings?status=ACTIVE")))
ym = sql("select to_char(start_at at time zone 'Europe/Bucharest','YYYY-MM') from bookings where vehicle_id in (select id from vehicles where owner_id='%s') order by start_at limit 1" % owner_id)
check("the calendar of the month with a booking shows it", "Yamaha Raptor 700" in text(get(J, f"/provider/calendar?month={ym}")))
fin = text(get(J, "/provider/finance"))
earned = int(sql(f"select coalesce(sum(owner_amount),0) from bookings b join vehicles v on v.id=b.vehicle_id where v.owner_id='{owner_id}' and b.status='COMPLETED'")) / 100
check("earnings equal the owner shares of the completed bookings", f"{earned:.0f} RON" in fin, fin[:300])
check("the page explains the fixed 15% commission", "15%" in fin)

print("== A COMPANY ADDS A MOTORCYCLE WITH PHOTOS IN THE SAME FORM")
K = "/tmp/j_co"
page = get(K, "/provider/vehicles/new")
check("the new-vehicle form has an optional photos field that accepts several images", 'name="photos"' in page and "multiple" in page and "image/jpeg,image/png,image/webp" in page and "Photos (optional)" in text(page))
fk = find_form(page, has=["name", "plate", "hourlyRon"])
mc = {"name": "Honda CB500X (photo test)", "type": "MOTORCYCLE", "plate": "ph-001", "locationId": loc, "hourlyRon": "90", "dailyRon": "400", "weekendRon": "", "year": "2023", "engineCc": "471", "powerHp": "48", "seats": "2", "licenseCategory": "A2", "category": "ADVENTURE", "description": "Photo test (synthetic)"}
r = submit(K, "/provider/vehicles/new", fk, {**mc, "plate": "ph-bad"}, files=[("photos", f"{TMP}/fake.jpg")])
check("a file that is not an image is refused before anything is created", "error=photo_NOT_AN_IMAGE" in r and sql("select count(*) from vehicles where plate='PH-BAD'") == "0", r)
r = submit(K, "/provider/vehicles/new", fk, {**mc, "plate": "ph-big"}, files=[("photos", f"{TMP}/big.jpg")])
check("a photo over 5 MB is refused before anything is created", "error=photo_TOO_BIG" in r and sql("select count(*) from vehicles where plate='PH-BIG'") == "0", r)
r = submit(K, "/provider/vehicles/new", fk, {**mc, "plate": "ph-many"}, files=[("photos", f"{gallery}/g{i % 6 + 1}.jpg") for i in range(9)])
check("more than 8 photos are refused before anything is created", "error=photo_TOO_MANY" in r and sql("select count(*) from vehicles where plate='PH-MANY'") == "0", r)
check("the errors are explained on the page", all(msg in text(get(K, f"/provider/vehicles/new?error={e}")) for e, msg in [("photo_NOT_AN_IMAGE", "Only JPEG, PNG or WebP"), ("photo_TOO_BIG", "at most 5 MB"), ("photo_TOO_MANY", "at most 8 photos")]))
r = submit(K, "/provider/vehicles/new", fk, mc, files=[("photos", f"{gallery}/g4.jpg"), ("photos", f"{gallery}/g2.jpg")])
m = re.search(r"/provider/vehicles/([a-z0-9]+)\?tab=photos&ok=created_photos", r)
check("a motorcycle with two photos is created and the company lands on its photos tab", m is not None, r)
mid = m.group(1)
co_id = sql("select id from users where email='demo.company@example.com'")
check("it belongs to the company, waits for approval and has the two photos in order", sql(f"select listing_status||'|'||owner_id||'|'||type||'|'||(select string_agg(position::text, ',' order by position) from vehicle_photos where vehicle_id=v.id) from vehicles v where id='{mid}'") == f"PENDING|{co_id}|MOTORCYCLE|0,1")
paths = sql(f"select string_agg(path, ' ') from vehicle_photos where vehicle_id='{mid}'").split()
check("the files are on disk under random names, and they are served", all(re.fullmatch(r"uploads/[0-9a-f]{32}\.(jpg|png|webp)", x) and os.path.exists(os.path.join(UP, x.split("/")[-1])) and status(K, "/" + x).startswith("200") for x in paths), paths)
tab = get(K, m.group(0))
check("the photos tab shows the success message and both photos", "created with its photos" in text(tab) and all(x in tab for x in paths), text(tab)[:200])
check("another provider cannot see or change them", status("/tmp/j_own", f"/provider/vehicles/{mid}?tab=photos").startswith("404"))
r = submit(K, "/provider/vehicles/new", fk, {**mc, "plate": "ph-002"})
check("without photos the form still works as before", re.search(r"\?tab=photos&ok=created$", r) is not None and sql("select count(*) from vehicle_photos where vehicle_id=(select id from vehicles where plate='PH-002')") == "0", r)
r = submit(K, "/provider/vehicles/new", fk, {**mc, "plate": "ph-001"}, files=[("photos", f"{gallery}/g1.jpg")])
check("a duplicate plate with a photo is refused and no photo is stored", "error=plate" in r and sql("select count(*) from vehicle_photos where vehicle_id in (select id from vehicles where plate='PH-001')") == "2", r)
env = open(os.path.join(os.path.dirname(S), ".env")).read()
AE = re.search(r"^ADMIN_EMAIL=(.*)$", env, re.M).group(1).strip('"'); AP = re.search(r"^ADMIN_PASSWORD=(.*)$", env, re.M).group(1).strip('"')
A = "/tmp/j_adm_photo"; login(A, AE, AP)
fa = find_form(get(A, "/admin/vehicles/new"), has=["name", "plate", "hourlyRon"])
r = submit(A, "/admin/vehicles/new", fa, {**mc, "name": "Suzuki V-Strom (admin photo test)", "plate": "ph-adm"}, files=[("photos", f"{gallery}/g6.jpg")])
check("an administrator can add a platform vehicle with a photo; it is approved at once", "/admin/vehicles/" in r and "ok=created_photos" in r and sql("select listing_status||'|'||count(p.id) from vehicles v left join vehicle_photos p on p.vehicle_id=v.id where v.plate='PH-ADM' group by v.listing_status") == "APPROVED|1", r)

print("== PHOTOS ADDED WITH THE FORM: HOSTILE FILES, APPROVAL, AND THE IMAGE REALLY SHOWN")
import hashlib, subprocess
g4 = f"{gallery}/g4.jpg"
hostile = {
    "a .php name with JPEG bytes": f"{g4};filename=shell.php",
    "an .svg name with JPEG bytes": f"{g4};filename=pic.svg;type=image/svg+xml",
    "a double extension that ends in .exe": f"{g4};filename=pic.jpg.exe",
    "no extension": f"{g4};filename=picture",
    "PNG name with JPEG bytes": f"{g4};filename=x.png;type=image/png",
    "a JPEG that declares text/html": f"{g4};filename=x.jpg;type=text/html",
}
for label, spec in hostile.items():
    r = submit(K, "/provider/vehicles/new", fk, {**mc, "plate": "ph-evil"}, files=[("photos", spec)])
    check(f"create form, {label}: refused, nothing created", "error=photo_NOT_AN_IMAGE" in r and sql("select count(*) from vehicles where plate='PH-EVIL'") == "0", r)
before = sql(f"select count(*) from vehicle_photos where vehicle_id='{mid}'")
up = find_form(get(K, f"/provider/vehicles/{mid}?tab=photos"), has=["vehicleId", "photos"])
for label, spec in list(hostile.items())[:3] + [("a text file named .jpg", f"{TMP}/fake.jpg")]:
    r = submit(K, f"/provider/vehicles/{mid}", up, files=[("photos", spec)])
    check(f"photos tab, {label}: refused, nothing stored", "error=photo_NOT_AN_IMAGE" in r and sql(f"select count(*) from vehicle_photos where vehicle_id='{mid}'") == before, r)
uploads_now = len(os.listdir(UP))
r = submit(K, "/provider/vehicles/new", fk, {**mc, "plate": "ph-mix"}, files=[("photos", g4), ("photos", f"{TMP}/fake.jpg")])
check("one good and one bad file in the same form: the whole form is refused and no file is left on disk", "error=photo_NOT_AN_IMAGE" in r and sql("select count(*) from vehicles where plate='PH-MIX'") == "0" and len(os.listdir(UP)) == uploads_now, r)
submit("/tmp/j_cust", "/provider/vehicles/new", fk, {**mc, "plate": "ph-anon"}, files=[("photos", g4)])
check("a customer cannot create a vehicle with photos", sql("select count(*) from vehicles where plate='PH-ANON'") == "0")

# the listing is PENDING: not public, and its photo is not shown anywhere public. After approval the image is shown for real.
check("before approval the vehicle and its photo are not in the public catalog", status(None, f"/vehicles/{mid}").startswith("404") and "Honda CB500X (photo test)" not in get(None, "/vehicles?q=CB500X"))
lst = get(A, "/admin/vehicles?listing=PENDING")
mod = [f for f in forms(lst) if any(n == "vehicleId" and v == mid for n, v, t in f["fields"]) and any(b[0] == "decision" and b[1] == "approve" for b in f["buttons"])]
check("the administrator sees the pending listing with its cover photo", bool(mod) and sql(f"select path from vehicle_photos where vehicle_id='{mid}' and position=0") in lst, "")
submit(A, "/admin/vehicles", mod[0], button=("decision", "approve"))
check("approved", sql(f"select listing_status from vehicles where id='{mid}'") == "APPROVED")
orig = hashlib.sha256(open(g4, "rb").read()).hexdigest()
def fetch(path):
    out = subprocess.run(["curl", "-s", "-D", "-", BASE + path], capture_output=True).stdout
    head, _, body = out.partition(b"\r\n\r\n")
    return head.decode(), body
for where, page in [("the catalog", get(None, "/vehicles?q=CB500X")), ("the vehicle page", get(None, f"/vehicles/{mid}"))]:
    srcs = re.findall(r'<img[^>]+src="(/uploads/[0-9a-f]{32}\.jpg)"', page)
    check(f"{where} shows the uploaded photo", len(srcs) >= 1, srcs)
    head, body = fetch(srcs[0]) if srcs else ("", b"")
    check(f"...the image address answers 200 image/jpeg with nosniff and the very bytes that were uploaded (sha-256 equal)", " 200" in head.split("\r\n")[0] and "image/jpeg" in head.lower() and "nosniff" in head.lower() and hashlib.sha256(body).hexdigest() == orig, head[:80])
check("the provider and the admin lists show the cover too", sql(f"select path from vehicle_photos where vehicle_id='{mid}' and position=0") in get(K, "/provider/vehicles") and sql(f"select path from vehicle_photos where vehicle_id='{mid}' and position=0") in get(A, "/admin/vehicles"))
print("FAILS:", FAILS)
