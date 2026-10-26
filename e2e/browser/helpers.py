"""Small helpers shared by the real-browser scripts (flows.py, ridedna.py)."""
import csv, datetime as dt, glob, io, os, re, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE); sys.path.insert(0, os.path.dirname(HERE))
from marionette import Browser, EL  # noqa: F401
from driver import BASE, check, sql, FAILS  # noqa: F401

DEMO = "Demo-pass-2030!"
env = open(os.path.join(os.path.dirname(os.path.dirname(HERE)), ".env")).read()
ADMIN = (re.search(r"^ADMIN_EMAIL=(.*)$", env, re.M).group(1).strip('"'), re.search(r"^ADMIN_PASSWORD=(.*)$", env, re.M).group(1).strip('"'))
DL = os.path.join(os.environ.get("E2E_TMP", "/tmp"), "browser-downloads")
SET_VALUE = "const [el, v] = arguments; Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));"

def login(b, email, password):
    b.get(BASE + "/login"); b.type("input[name=email]", email); b.type("input[name=password]", password)
    b.click("form button[type=submit]:last-of-type"); time.sleep(2.5)
def click(b, css):
    b.js("arguments[0].scrollIntoView({block: 'center'})", {EL: b.find(css)}); time.sleep(0.4); b.click(css)  # centred, so the sticky header never covers it
def set_value(b, css, value): b.js(SET_VALUE, {EL: b.find(css)}, value)
def wait_text(b, text, t=10):
    end = time.time() + t
    while time.time() < end:
        if text.lower() in b.text().lower(): return True
        time.sleep(0.3)
    return False
def cards(b): return b.js("return [...new Set([...document.querySelectorAll('main a[href^=\"/vehicles/\"]')].map(a => a.getAttribute('href')))].length")
def download(b, click_css):
    for f in glob.glob(os.path.join(DL, "*")): os.remove(f)
    click(b, click_css)
    end = time.time() + 15
    while time.time() < end:
        files = [f for f in glob.glob(os.path.join(DL, "*")) if not f.endswith(".part")]
        if files: return open(files[0], "rb").read(), os.path.basename(files[0])
        time.sleep(0.3)
    return None, None

