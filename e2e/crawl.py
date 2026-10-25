"""Follows every internal link and image of the main pages for each role and reports broken ones (404/500),
so no button or link leads nowhere. Also checks that every seeded photo is served and credited."""
import sys, os, re, json, subprocess, html
sys.path.insert(0, os.path.dirname(__file__))
from driver import *

env = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")).read()
AE = re.search(r"^ADMIN_EMAIL=(.*)$", env, re.M).group(1).strip('"'); AP = re.search(r"^ADMIN_PASSWORD=(.*)$", env, re.M).group(1).strip('"')
DEMO = "Demo-pass-2030!"
ROLES = {"anon": (None, ["/", "/vehicles", "/login", "/register"]),
         "customer": ("/tmp/jx_c", ["/", "/vehicles", "/account", "/account/bookings", "/account/profile"], "demo.customer@example.com", DEMO),
         "owner": ("/tmp/jx_o", ["/provider", "/provider/vehicles", "/provider/bookings", "/provider/calendar", "/provider/finance"], "demo.owner@example.com", DEMO),
         "company": ("/tmp/jx_k", ["/provider", "/provider/vehicles", "/provider/quotes", "/provider/finance"], "demo.company@example.com", DEMO),
         "admin": ("/tmp/jx_a", ["/admin", "/admin/bookings", "/admin/vehicles", "/admin/users", "/admin/quotes", "/admin/maintenance", "/admin/finance", "/admin/payouts", "/admin/locations"], AE, AP)}
SKIP = re.compile(r"^(/api/|/_next/|/admin/finance/export|#|mailto:|tel:)")

def fetch(jar, path):
    out = subprocess.run(["curl", "-s", "-o", "/tmp/crawl.body", "-w", "%{http_code}", *(["-b", jar] if jar else []), BASE + path], capture_output=True, text=True).stdout
    return out, open("/tmp/crawl.body", errors="replace").read()

seen_global = {}
for role, spec in ROLES.items():
    jar, starts = spec[0], spec[1]
    if jar: login(jar, spec[2], spec[3])
    queue = [(s, "start") for s in starts]; seen = set(); broken = []; n = 0
    while queue and n < 140:
        path, ref = queue.pop(0)
        path = path.split("#")[0]
        if path in seen or not path.startswith("/") or path.startswith("//") or SKIP.match(path): continue
        seen.add(path); n += 1
        code, body = fetch(jar, path)
        if code[0] in "45" and not (code == "404" and path.startswith("/vehicles/does-not")): broken.append((code, path, ref))
        if code != "200": continue
        for href in re.findall(r'href="([^"#][^"]*)"', body):
            h = html.unescape(href)
            if h.startswith("/") and not h.startswith("//") and not SKIP.match(h) and "signout" not in h: queue.append((h, path))
        for src in set(re.findall(r'<img[^>]+src="([^"]+)"', body)):
            s = html.unescape(src)
            if s.startswith("/") and s not in seen_global:
                c = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", BASE + s], capture_output=True, text=True).stdout
                seen_global[s] = c
                if c != "200": broken.append((c, s, path))
    check(f"{role}: {n} pages followed, no broken link or image", not broken, str(broken[:4]))

print("== seeded photos")
rows = sql("select v.name||'|'||p.path from vehicle_photos p join vehicles v on v.id=p.vehicle_id where p.path like '/vehicles/%' or p.path like '/gallery/%'").split("\n")
credits = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src/lib/photo-credits.json")))
missing_file = [r for r in rows if subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", BASE + r.split("|")[1]], capture_output=True, text=True).stdout != "200"]
check(f"all {len(rows)} seeded photo rows point to a served file", not missing_file, str(missing_file[:3]))
no_credit = [r for r in rows if r.split("|")[1].startswith("/vehicles/") and r.split("|")[1].split("/")[-1][:-4] not in credits["vehicles"]]
check("every seeded vehicle photo has an author, a licence and a source", not no_credit, str(no_credit[:3]))
bad_credit = [k for k, c in credits["vehicles"].items() if not (c.get("author") and c.get("license") and c.get("source", "").startswith("https://commons.wikimedia.org/"))]
check("every credit names a Commons source and a licence", not bad_credit, str(bad_credit))
cats = sql("select string_agg(distinct category::text, ',' order by category::text) from vehicles where owner_id is null and listing_status='APPROVED'")
check("the platform fleet covers all six categories", cats == "ADVENTURE,ATV_SPORT,ATV_UTILITY,CRUISER,DUAL_SPORT,NAKED_SPORT", cats)
check("the platform fleet has the 17 demo models", int(sql("select count(*) from vehicles where owner_id is null and category is not null")) == 17)
print("FAILS:", FAILS)
