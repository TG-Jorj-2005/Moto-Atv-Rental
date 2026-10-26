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
print("FAILS:", FAILS)
sys.exit(1 if FAILS else 0)
