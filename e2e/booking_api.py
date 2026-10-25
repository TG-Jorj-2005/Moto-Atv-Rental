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
print("FAILS:", FAILS)
