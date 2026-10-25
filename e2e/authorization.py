import sys, os, re, json, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from driver import *
DEMO = "Demo-pass-2030!"
env = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")).read()
AE = re.search(r"^ADMIN_EMAIL=(.*)$", env, re.M).group(1).strip('"'); AP = re.search(r"^ADMIN_PASSWORD=(.*)$", env, re.M).group(1).strip('"')
J = {"cust": ("/tmp/j5c", "demo.customer@example.com", DEMO), "cust2": ("/tmp/j5c2", "demo.customer2@example.com", DEMO), "own": ("/tmp/j5o", "demo.owner@example.com", DEMO), "co": ("/tmp/j5k", "demo.company@example.com", DEMO), "adm": ("/tmp/j5a", AE, AP)}
for k, (jar, e, p) in J.items(): login(jar, e, p)
jar = {k: v[0] for k, v in J.items()}; jar["anon"] = None; jar["anonf"] = "/tmp/j5none"

print("== route matrix")
def code(who, path):
    s = status(jar[who], path); return s.split()[0] + (" ->" + s.split()[1].replace(BASE, "") if len(s.split()) > 1 else "")
matrix = {
  "/account": {"anon": "307 ->/login", "cust": "200", "own": "200", "co": "200", "adm": "307 ->/forbidden"},
  "/provider": {"anon": "307 ->/login", "cust": "307 ->/forbidden", "own": "200", "co": "200", "adm": "307 ->/forbidden"},
  "/provider/quotes": {"anon": "307 ->/login", "cust": "307 ->/forbidden", "own": "307 ->/forbidden", "co": "200", "adm": "307 ->/forbidden"},
  "/admin": {"anon": "307 ->/login", "cust": "307 ->/forbidden", "own": "307 ->/forbidden", "co": "307 ->/forbidden", "adm": "200"},
  "/admin/users": {"anon": "307 ->/login", "cust": "307 ->/forbidden", "own": "307 ->/forbidden", "co": "307 ->/forbidden", "adm": "200"},
  "/admin/finance/export": {"anon": "401", "cust": "403", "own": "403", "co": "403", "adm": "200"},
}
for path, rows in matrix.items():
    for who, want in rows.items():
        got = code(who, path)
        if want.startswith("307 ->") and not got.startswith("307"): check(f"{who} {path} -> {want}", False, got)
        else: check(f"{who} {path} -> {want}", got.split(" ->")[0] == want.split(" ->")[0] and (len(want.split(" ->")) == 1 or want.split(" ->")[1] in got), got)

print("== forged admin server actions by every other role")
pend = sql("select b.id from bookings b where b.status='PENDING' limit 1")
page = get(jar["adm"], f"/admin/bookings/{pend}")
act = find_form(page, has=["bookingId", "reason"])
users = get(jar["adm"], "/admin/users")
cust_id = sql("select id from users where email='demo.customer2@example.com'"); co_id = sql("select id from users where email='demo.company@example.com'")
rolef = find_form(get(jar["adm"], f"/admin/users?confirm={cust_id}&to=OWNER"), has=["userId", "role"])
ratef = find_form(get(jar["adm"], "/admin/payouts"), has=["ownerId", "percent"])
payf = find_form(page, has=["bookingId", "amount"])
locf = find_form(get(jar["adm"], "/admin/locations"), has=["name", "city", "county"])
for who in ["anon", "cust", "own", "co"]:
    j = jar["anonf" if who == "anon" else who]
    submit(j, "/account", act, {"reason": "forged"}, button=("to", "CONFIRMED"))
    check(f"{who}: forged booking confirmation changes nothing", sql(f"select status from bookings where id='{pend}'") == "PENDING")
    submit(j, "/account", rolef, {"userId": cust_id, "role": "ADMIN"})
    check(f"{who}: forged role change to ADMIN changes nothing", sql(f"select role from users where id='{cust_id}'") == "CUSTOMER")
    submit(j, "/account", ratef, {"percent": "5"})
    check(f"{who}: forged commission rate changes nothing", sql(f"select commission_bps from users where id='{co_id}'") == "800")
    n = sql("select count(*) from payments"); submit(j, "/account", payf, {"amount": "1", "currency": "RON", "method": "CASH"})
    check(f"{who}: forged payment records nothing", sql("select count(*) from payments") == n)
    submit(j, "/account", locf, {"name": f"Forged by {who}", "city": "X", "county": "Y", "address": "Forged 1", "phone": "1", "hours": "-"})
    check(f"{who}: forged location creates nothing", sql(f"select count(*) from locations where name='Forged by {who}'") == "0")
check("and the real administrator can still do it (control)", "ok" in (submit(jar["adm"], f"/admin/bookings/{pend}", act, {"reason": ""}, button=("to", "CONFIRMED")) or "") and sql(f"select status from bookings where id='{pend}'") == "CONFIRMED")

print("== isolation between providers")
own_id = sql("select id from users where email='demo.owner@example.com'")
ov = sql(f"select id from vehicles where owner_id='{own_id}' and listing_status='APPROVED' limit 1"); cv = sql(f"select id from vehicles where owner_id='{co_id}' and listing_status='APPROVED' limit 1")
for who, mine, foreign in [("own", ov, cv), ("co", cv, ov)]:
    check(f"{who} cannot open the other's vehicle manager", status(jar[who], f"/provider/vehicles/{foreign}").startswith("404"))
    ed = find_form(get(jar[who], f"/provider/vehicles/{mine}?tab=details"), has=["name", "hourlyRon", "vehicleId"])
    before = sql(f"select name||daily_rate||status||listing_status from vehicles where id='{foreign}'")
    submit(jar[who], f"/provider/vehicles/{mine}", ed, {"vehicleId": foreign, "name": "HIJACKED", "dailyRon": "1"})
    check(f"{who} cannot edit the other's vehicle by forging the id", sql(f"select name||daily_rate||status||listing_status from vehicles where id='{foreign}'") == before)
    mt = find_form(get(jar[who], f"/provider/vehicles/{mine}?tab=maintenance"), has=["type", "performedOn"])
    n = sql(f"select count(*) from maintenance where vehicle_id='{foreign}'")
    submit(jar[who], f"/provider/vehicles/{mine}", mt, {"vehicleId": foreign, "type": "SERVICE", "performedOn": "2026-10-01"})
    check(f"{who} cannot add maintenance to the other's vehicle", sql(f"select count(*) from maintenance where vehicle_id='{foreign}'") == n)
    page = text(get(jar[who], "/provider/bookings")) + text(get(jar[who], "/provider/finance")) + text(get(jar[who], "/provider"))
    others = sql(f"select string_agg(distinct v.name, '|') from bookings b join vehicles v on v.id=b.vehicle_id where v.owner_id='{co_id if who == 'own' else own_id}'")
    check(f"{who} sees no booking or money of the other provider", not any(n in page for n in (others or "").split("|") if n))
    check(f"{who}'s calendar and finance never show the other's vehicles", status(jar[who], f"/provider/calendar?vehicle={foreign}").startswith("200"))
check("a company cannot read an owner's customer booking detail through the customer area", status(jar["co"], "/account/bookings/" + sql(f"select b.id from bookings b join vehicles v on v.id=b.vehicle_id where v.owner_id='{own_id}' limit 1")).startswith("404"))
check("a customer cannot read another customer's booking", status(jar["cust"], "/account/bookings/" + sql("select id from bookings where user_id=(select id from users where email='demo.customer2@example.com') limit 1")).startswith("404"))
check("a vehicle in someone's PENDING listing is hidden from the public", status(None, "/vehicles/" + sql("select id from vehicles where listing_status='PENDING' limit 1")).startswith("404"))

print("== status API")
row = sql(f"select b.id||'|'||u.email from bookings b join users u on u.id=b.user_id where b.status='PENDING' and b.id<>'{pend}' and u.role='CUSTOMER' limit 1")
other, owner_email = row.split("|")
mine = "cust2" if owner_email == "demo.customer2@example.com" else "cust"
stranger = "cust" if mine == "cust2" else "cust2"
def api(who, bid, body):
    args = ["curl", "-s", "-o", "/tmp/s.out", "-w", "%{http_code}", "-X", "POST", "-H", "Content-Type: application/json", "-d", json.dumps(body)] + (["-b", jar[who]] if jar[who] else []) + [f"{BASE}/api/bookings/{bid}/status"]
    return subprocess.run(args, capture_output=True, text=True).stdout
check("anonymous: 401", api("anon", other, {"to": "CANCELLED", "reason": "x"}) == "401")
check("another customer cannot cancel it (403/404)", api(stranger, other, {"to": "CANCELLED", "reason": "x"}) in ("403", "404") and sql(f"select status from bookings where id='{other}'") == "PENDING")
check("the owner of the vehicle cannot confirm it", api("own", other, {"to": "CONFIRMED"}) in ("403", "404") and sql(f"select status from bookings where id='{other}'") == "PENDING")
check("the customer cannot confirm their own booking", api(mine, other, {"to": "CONFIRMED"}) in ("403",) and sql(f"select status from bookings where id='{other}'") == "PENDING")
check("an unknown status is rejected (400)", api(mine, other, {"to": "HACKED"}) == "400")
check("the customer can cancel their own pending booking", api(mine, other, {"to": "CANCELLED", "reason": "changed my mind"}) == "200" and sql(f"select status from bookings where id='{other}'") == "CANCELLED")
check("a second cancel is refused", api(mine, other, {"to": "CANCELLED"}) == "409")
print("FAILS:", FAILS)
