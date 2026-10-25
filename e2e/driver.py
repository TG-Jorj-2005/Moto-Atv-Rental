"""Tiny UI test driver: logs in with curl cookie jars, parses the forms of a page (Next.js server actions carry a hidden
$ACTION_ID_ field) and submits them like a browser would. Used for the functional checks of the screens."""
import os, re, subprocess, sys, json, html
from html.parser import HTMLParser

BASE = __import__("os").environ.get("BASE", "http://localhost:3000")
T = os.environ.get("E2E_DB_URL", "postgresql://rental:rental@localhost:5433/rental_test")
FAILS = []

def curl(args):
    return subprocess.run(["curl", "-s", *args], capture_output=True, text=True).stdout

def login(jar, email, password):
    subprocess.run(["rm", "-f", jar])
    curl(["-c", jar, f"{BASE}/api/auth/csrf", "-o", jar + ".csrf"])
    tok = json.load(open(jar + ".csrf"))["csrfToken"]
    curl(["-b", jar, "-c", jar, "-o", "/dev/null", "-X", "POST", f"{BASE}/api/auth/callback/credentials", "--data-urlencode", f"csrfToken={tok}", "--data-urlencode", f"email={email}", "--data-urlencode", f"password={password}", "--data-urlencode", "json=true"])

def get(jar, path):
    return curl(["-b", jar, "-L", f"{BASE}{path}"]) if jar else curl(["-L", f"{BASE}{path}"])

def status(jar, path):
    out = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code} %{redirect_url}", *(["-b", jar] if jar else []), f"{BASE}{path}"], capture_output=True, text=True).stdout
    return out.strip()

class FormParser(HTMLParser):
    def __init__(self):
        super().__init__(); self.forms = []; self.cur = None; self.sel = None; self.ta = None
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form":
            self.cur = {"fields": [], "buttons": [], "text": "", "enctype": a.get("enctype"), "method": a.get("method")}
        elif self.cur is not None and tag in ("input", "textarea", "select", "button"):
            name = a.get("name")
            if tag == "button":
                self.cur["buttons"].append((name, a.get("value", "")))
            elif name and tag == "select":
                self.sel = name
            elif name and tag == "textarea":
                self.cur["fields"].append((name, "", "textarea")); self.ta = len(self.cur["fields"]) - 1
            elif name:
                self.cur["fields"].append((name, a.get("value", ""), a.get("type", tag)))
        elif self.cur is not None and tag == "option" and "selected" in a:
            self.cur["fields"].append((getattr(self, "sel", "__selected__"), a.get("value", ""), "select"))
    def handle_endtag(self, tag):
        if tag == "textarea": self.ta = None
        if tag == "form" and self.cur is not None:
            self.forms.append(self.cur); self.cur = None
    def handle_data(self, data):
        if self.cur is not None:
            self.cur["text"] += data
            if self.ta is not None:
                n, v, t = self.cur["fields"][self.ta]; self.cur["fields"][self.ta] = (n, v + data, t)

def forms(page):
    p = FormParser(); p.feed(page); return p.forms

def find_form(page, has=None, button=None, contains=None, nth=0):
    seen = 0
    for f in forms(page):
        names = [n for n, _, _ in f["fields"]]
        if has and not all(h in names for h in has): continue
        if button and not any(b[0] == button[0] and b[1] == button[1] for b in f["buttons"]): continue
        if not any(n.startswith("$ACTION_") for n in names): continue
        if contains and contains not in f["text"]: continue
        if seen < nth:
            seen += 1; continue
        return f
    return None

def submit(jar, path, form, values=None, button=None, files=None):
    """POST a parsed form; returns (http_code, redirect_url)."""
    args = ["-b", jar, "-o", "/dev/null", "-w", "%{http_code} %{redirect_url}"]
    for name, value, typ in form["fields"]:
        if name == "__selected__" or typ == "file": continue
        v = (values or {}).get(name, value)
        args += ["--form-string", f"{name}={v}"]
    for k, v in (values or {}).items():
        if k not in [n for n, _, _ in form["fields"]]: args += ["--form-string", f"{k}={v}"]
    if button: args += ["--form-string", f"{button[0]}={button[1]}"]
    for name, path_ in (files or []): args += ["-F", f"{name}=@{path_}"]
    out = subprocess.run(["curl", "-s", *args, f"{BASE}{path}"], capture_output=True, text=True).stdout
    return out.strip()

def sql(q):
    return subprocess.run(["psql", T, "-Atc", q], capture_output=True, text=True).stdout.strip()

def check(label, cond, detail=""):
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  [{detail}]" if detail and not cond else ""))
    if not cond: FAILS.append(label)

def text(page):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", re.sub(r"<!--.*?-->", "", page))))
