import sys, os, json, subprocess, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
from driver import *
login("/tmp/j_c4", "demo.customer@example.com", "Demo-pass-2030!")
vid = sql("select id from vehicles where plate='CJ-04-MOT' or plate like 'CJ%' limit 1") or sql("select id from vehicles where listing_status='APPROVED' and status='AVAILABLE' and owner_id is null limit 1")
vid = sql("select id from vehicles where listing_status='APPROVED' and status='AVAILABLE' and owner_id is null and id not in (select vehicle_id from bookings) limit 1")
def post(jar, body):
    args = ["curl","-s","-o","/tmp/api.out","-w","%{http_code}","-X","POST","-H","Content-Type: application/json","-d",json.dumps(body)] + (["-b",jar] if jar else []) + [BASE+"/api/bookings"]
    code = subprocess.run(args,capture_output=True,text=True).stdout
    try: return code, json.load(open("/tmp/api.out"))
    except Exception: return code, None
def iso(days, hour): return (dt.datetime.utcnow()+dt.timedelta(days=days)).replace(hour=hour,minute=0,second=0,microsecond=0).strftime("%Y-%m-%dT%H:%M:%S.000Z")
cust = {"fullName":"Demo Customer","email":"demo.customer@example.com","phone":"0700000000"}
b = {"vehicleId":vid,"startAt":iso(20,8),"endAt":iso(21,8),"customer":cust}
c, _ = post(None, b); check("anonymous booking is refused (401)", c=="401", c)
c, r = post("/tmp/j_c4", {**b, "customer":{**cust,"email":"someone.else@example.com"}}); check("an email different from the account is refused (400)", c=="400", (c,r))
c, r = post("/tmp/j_c4", {**b, "startAt":iso(-1,8), "endAt":iso(0,8)}); check("a start in the past is refused", c=="400", (c,r))
c, r = post("/tmp/j_c4", {**b, "endAt":iso(20,7)}); check("end before start is refused", c=="400", (c,r))
c, r = post("/tmp/j_c4", {**b, "vehicleId":"nope"}); check("unknown vehicle is 404 or 400", c in("404","400"), (c,r))
c, r = post("/tmp/j_c4", b); check("a valid booking is created as PENDING", c in("200","201") and sql(f"select status from bookings where id='{r['id']}'")=="PENDING", (c,r))
hist = sql(f"select count(*) from booking_status_history where booking_id='{r['id']}'"); check("with its history row and commission snapshot", hist=="1" and sql(f"select commission_bps from bookings where id='{r['id']}'")=="0")
login("/tmp/j_c4b", "demo.customer2@example.com", "Demo-pass-2030!")
c, r2 = post("/tmp/j_c4b", {**b, "customer":{**cust,"email":"demo.customer2@example.com"}}); check("an overlapping booking by someone else is 409", c=="409", (c,r2))
# max 3 pending
ids=[]
for i in range(4):
    v = sql(f"select id from vehicles where listing_status='APPROVED' and status='AVAILABLE' and id not in (select vehicle_id from bookings where status<>'CANCELLED') offset {i} limit 1")
    c, r3 = post("/tmp/j_c4b", {"vehicleId":v,"startAt":iso(40+i,8),"endAt":iso(40+i,12),"customer":{**cust,"email":"demo.customer2@example.com"}}); ids.append(c)
print("   pending attempts:", ids)
check("the user's pending limit stops the extra bookings", ids.count("409")+ids.count("400")+ids.count("422")+ids.count("429")>=1 or ids.count("201")+ids.count("200")<=3, ids)


print("== PENDING LIMIT UNDER CONCURRENCY")
import concurrent.futures, datetime as dt
reg = find_form(get(None, "/register"), has=["name", "email", "password", "role"])
open("/tmp/j_cc", "w").close()
submit("/tmp/j_cc", "/register", reg, {"name": "Concurrent User", "email": "concurrent.user@example.test", "password": "parola-lunga-1", "role": "CUSTOMER"})
login("/tmp/j_cc", "concurrent.user@example.test", "parola-lunga-1")
vehicles = sql("select id from vehicles where listing_status='APPROVED' and status='AVAILABLE' and owner_id is null limit 8").split("\n")
cc_cust = {"fullName": "Concurrent User", "email": "concurrent.user@example.test", "phone": "0700000000"}
def fire(i):
    b = {"vehicleId": vehicles[i], "startAt": iso(90 + i, 8), "endAt": iso(90 + i, 12), "customer": cc_cust}
    return post("/tmp/j_cc", b)[0]
with concurrent.futures.ThreadPoolExecutor(8) as ex: codes = list(ex.map(fire, range(8)))
check("8 simultaneous requests from one user create exactly 3 PENDING bookings", codes.count("201") == 3 and sql("select count(*) from bookings where user_id=(select id from users where email='concurrent.user@example.test') and status='PENDING'") == "3", codes)
check("the other 5 are answered 429 (pending limit), never 500", sorted(set(codes) - {"201"}) == ["429"], codes)
b4 = {"vehicleId": vehicles[0], "startAt": iso(120, 8), "endAt": iso(120, 12), "customer": cc_cust}
check("a 4th booking later is refused too", post("/tmp/j_cc", b4)[0] == "429")

print("== SAME SLOT UNDER CONCURRENCY")
users = []
for i in range(6):
    jar = f"/tmp/j_cs{i}"; open(jar, "w").close()
    em = f"slot.user{i}@example.test"
    submit(jar, "/register", reg, {"name": f"Slot User {i}", "email": em, "password": "parola-lunga-1", "role": "CUSTOMER"})
    login(jar, em, "parola-lunga-1"); users.append((jar, em))
slot_vehicle = vehicles[-1]
def fight(u):
    jar, em = u
    return post(jar, {"vehicleId": slot_vehicle, "startAt": iso(200, 8), "endAt": iso(200, 12), "customer": {"fullName": "Slot User", "email": em, "phone": "0700000000"}})[0]
with concurrent.futures.ThreadPoolExecutor(6) as ex: codes = list(ex.map(fight, users))
check("6 users booking the same slot at once: exactly one wins, the rest get 409, no 500", codes.count("201") == 1 and codes.count("409") == 5, codes)
check("and the database holds exactly one booking for that slot", sql(f"select count(*) from bookings where vehicle_id='{slot_vehicle}' and start_at::date = (now() + interval '200 days')::date and status<>'CANCELLED'") in ("1",), codes)
sql("delete from booking_status_history where booking_id in (select id from bookings where user_id in (select id from users where email like '%@example.test'))")
sql("delete from bookings where user_id in (select id from users where email like '%@example.test')")
sql("delete from users where email like '%@example.test'")
print("FAILS:", FAILS)
