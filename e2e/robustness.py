"""Hostile and malformed requests: never a 5xx, never a stack trace, never a leaked internal detail."""
import sys, os, re, subprocess
sys.path.insert(0, os.path.dirname(__file__))
from driver import *
env = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")).read()
AE = re.search(r"^ADMIN_EMAIL=(.*)$", env, re.M).group(1).strip('"'); AP = re.search(r"^ADMIN_PASSWORD=(.*)$", env, re.M).group(1).strip('"')
login("/tmp/jr_a", AE, AP); login("/tmp/jr_o", "demo.owner@example.com", "Demo-pass-2030!"); login("/tmp/jr_c", "demo.customer@example.com", "Demo-pass-2030!")
LEAK = re.compile(r"node_modules|\.next/|PrismaClient|at (Object|async|Module)\.|stack|ECONNREFUSED|postgresql://|AUTH_SECRET|password_hash", re.I)
def probe(label, jar, path, method="GET", data=None, ctype=None, expect=None):
    args = ["curl", "-s", "-o", "/tmp/rb.body", "-w", "%{http_code}", "-X", method, "-m", "30"]
    if jar: args += ["-b", jar]
    if ctype: args += ["-H", f"Content-Type: {ctype}"]
    if data is not None:
        open("/tmp/rb.req", "w").write(data); args += ["--data-binary", "@/tmp/rb.req"]
    code = subprocess.run(args + [BASE + path], capture_output=True, text=True).stdout
    body = open("/tmp/rb.body", errors="replace").read()
    ok = not code.startswith("5") and not LEAK.search(re.sub(r"<script.*?</script>", "", body, flags=re.S)) and (expect is None or code in expect)
    check(f"{label}: {code}", ok, f"{code} {LEAK.search(body).group(0) if LEAK.search(body) else ''}")

big = "x" * 300000
for label, path in [
    ("huge page number", "/vehicles?page=99999999999999999999"), ("price as exponent", "/vehicles?minPrice=1e999&maxPrice=-1e999"),
    ("NUL byte in search", "/vehicles?q=%00"), ("very long search", f"/vehicles?q={'a' * 5000}"), ("unicode search", "/vehicles?q=%F0%9F%8F%8D%EF%B8%8F%20%C8%99%C8%9B"),
    ("SQL-looking search", "/vehicles?q=%27%3B%20DROP%20TABLE%20users%3B--"), ("array parameters", "/vehicles?type=ATV&type=SCOOTER&sort[]=x"),
    ("invalid UTF-8 id", "/vehicles/%FF%FE"), ("NUL id", "/vehicles/%00"), ("very long id", f"/vehicles/{'a' * 3000}"),
    ("bad price dates", "/api/vehicles/x/price?start=abc&end=def"), ("missing price params", "/api/vehicles/x/price"),
    ("upload traversal", "/uploads/..%2F..%2F.env"), ("upload dot-dot", "/uploads/%2e%2e/%2e%2e/etc/passwd"), ("unknown route", "/nothing/here"),
]: probe(label, None, path)
probe("GET on the booking API", None, "/api/bookings", expect=("401", "405"))
probe("invalid JSON to the booking API", "/tmp/jr_c", "/api/bookings", "POST", "{not json", "application/json", expect=("400",))
probe("wrong content type to the booking API", "/tmp/jr_c", "/api/bookings", "POST", "a=b", "text/plain", expect=("400",))
probe("huge JSON body to the booking API", "/tmp/jr_c", "/api/bookings", "POST", '{"vehicleId":"' + big + '"}', "application/json", expect=("400", "413", "404"))
probe("JSON array instead of an object", "/tmp/jr_c", "/api/bookings", "POST", "[]", "application/json", expect=("400",))
probe("booking with string dates", "/tmp/jr_c", "/api/bookings", "POST", '{"vehicleId":"x","startAt":"soon","endAt":1,"customer":{}}', "application/json", expect=("400",))
probe("status API with unknown id", "/tmp/jr_c", "/api/bookings/%00/status", "POST", '{"to":"CANCELLED","reason":"x"}', "application/json", expect=("400", "404"))
probe("NUL byte inside the JSON vehicle id", "/tmp/jr_c", "/api/bookings", "POST", '{"vehicleId":"a\\u0000b","startAt":"2031-01-01T08:00:00.000Z","endAt":"2031-01-01T10:00:00.000Z","customer":{"fullName":"Demo Customer","email":"demo.customer@example.com","phone":"0700000000"}}', "application/json", expect=("400", "404"))
probe("NUL byte inside the JSON customer name", "/tmp/jr_c", "/api/bookings", "POST", '{"vehicleId":"x","startAt":"2031-01-01T08:00:00.000Z","endAt":"2031-01-01T10:00:00.000Z","customer":{"fullName":"De\\u0000mo","email":"demo.customer@example.com","phone":"0700000000"}}', "application/json", expect=("400", "404"))
probe("NUL byte inside the status reason", "/tmp/jr_a", "/api/bookings/nope/status", "POST", '{"to":"CANCELLED","reason":"a\\u0000b"}', "application/json", expect=("400", "404"))
probe("status API with GET", "/tmp/jr_c", "/api/bookings/x/status", expect=("405",))
for label, path in [("admin booking with NUL id", "/admin/bookings/%00"), ("admin booking unknown id", "/admin/bookings/nope"), ("admin vehicle unknown id", "/admin/vehicles/nope"),
    ("admin list odd filters", "/admin/bookings?page=-5&status=XXX&flag=%00&q=%27"), ("admin users odd confirm", "/admin/users?confirm=%00&to=ADMIN"), ("admin users role not allowed", "/admin/users?confirm=x&to=SUPERUSER"),
    ("admin finance odd month", "/admin/finance?month=9999-99"), ("admin maintenance odd filter", "/admin/maintenance?filter=%00")]:
    probe(label, "/tmp/jr_a", path)
for label, path in [("provider vehicle unknown id", "/provider/vehicles/nope"), ("provider calendar odd month", "/provider/calendar?month=abc"), ("provider calendar far month", "/provider/calendar?month=0001-01"), ("provider bookings odd status", "/provider/bookings?status=%00")]:
    probe(label, "/tmp/jr_o", path)
for label, path in [("account booking unknown id", "/account/bookings/nope"), ("account bookings odd tab", "/account/bookings?tab=%00"), ("login with huge next", f"/login?next={'a' * 5000}")]:
    probe(label, "/tmp/jr_c", path)
ph = subprocess.run(["curl", "-sI", BASE + "/"], capture_output=True, text=True).stdout.lower()
check("security headers are present", all(h in ph for h in ["x-content-type-options: nosniff", "x-frame-options: deny", "referrer-policy", "permissions-policy"]))
check("the server does not announce its framework version", "x-powered-by" not in ph)
err = text(get(None, "/vehicles/does-not-exist"))
check("the 404 page is friendly and has a way back", "Page not found" in err or "not found" in err.lower())
print("FAILS:", FAILS)
