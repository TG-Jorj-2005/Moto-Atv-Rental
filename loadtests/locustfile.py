"""Load scenarios for the rental platform.

Run against a server that uses the TEST database, never the development one (see loadtests/README.md).

Scenarios (user classes):
- Visitor      anonymous people browsing the catalog, vehicle pages and the price preview
- Customer     logged-in people who browse, check prices, look at their bookings and book free slots
- SlotFighter  many logged-in people book the SAME vehicle for the SAME period: exactly one may win

Checks: no 5xx answer anywhere, business refusals (409 conflict, 429 pending limit) are expected and counted as
successes, and after the run the number of 201 answers for the contested slot must be exactly one.
"""
import os
import random
import threading
from datetime import datetime, timedelta, timezone

from locust import HttpUser, between, events, task

PASSWORD = os.environ.get("LOAD_PASSWORD", "Load-test-2030!")
USERS = int(os.environ.get("LOAD_USERS", "200"))
VEHICLES = [v for v in os.environ.get("LOAD_VEHICLE_IDS", "").split(",") if v]
if not VEHICLES:
    raise SystemExit("Set LOAD_VEHICLE_IDS (printed by `npm run loadtest:seed`).")

# One contested slot per run, far in the future so that previous runs do not interfere.
RUN = int(os.environ.get("LOAD_RUN", str(int(datetime.now().timestamp()))))
CONTESTED = VEHICLES[0]
CONTESTED_START = (datetime(2031, 1, 1, 8, tzinfo=timezone.utc) + timedelta(days=RUN % 3000)).replace(microsecond=0)
CONTESTED_END = CONTESTED_START + timedelta(hours=4)

_lock = threading.Lock()
_next_user = 0
_contested_wins = 0


def take_user() -> int:
    global _next_user
    with _lock:
        n = _next_user % USERS
        _next_user += 1
        return n


def iso(moment: datetime) -> str:
    return moment.strftime("%Y-%m-%dT%H:%M:%S.000Z")


class Visitor(HttpUser):
    weight = 5
    wait_time = between(0.5, 2)

    @task(6)
    def catalog(self):
        params = random.choice(["", "?type=ATV", "?type=MOTORCYCLE&sort=price_asc", "?q=load&page=1", "?minPrice=100&maxPrice=900&sort=price_desc"])
        self.client.get("/vehicles" + params, name="/vehicles?filters")

    @task(3)
    def home(self):
        self.client.get("/")

    @task(4)
    def vehicle_page(self):
        self.client.get(f"/vehicles/{random.choice(VEHICLES)}", name="/vehicles/[id]")

    @task(3)
    def price_preview(self):
        start = datetime.now(timezone.utc) + timedelta(days=random.randint(2, 200), hours=1)
        end = start + timedelta(hours=random.choice([2, 4, 24, 48]))
        self.client.get(f"/api/vehicles/{random.choice(VEHICLES)}/price", params={"start": iso(start), "end": iso(end), "cur": "RON"}, name="/api/vehicles/[id]/price")

    @task(1)
    def public_api(self):
        self.client.get("/api/vehicles")

    @task(1)
    def missing_page(self):
        with self.client.get("/vehicles/does-not-exist", name="/vehicles/[unknown]", catch_response=True) as r:
            r.success() if r.status_code == 404 else r.failure(f"expected 404, got {r.status_code}")


class LoggedIn(HttpUser):
    abstract = True
    wait_time = between(0.5, 2)

    def on_start(self):
        self.index = take_user()
        self.email = f"load.user{self.index}@example.test"
        token = self.client.get("/api/auth/csrf", name="/api/auth/csrf").json()["csrfToken"]
        with self.client.post(
            "/api/auth/callback/credentials",
            data={"csrfToken": token, "email": self.email, "password": PASSWORD, "json": "true"},
            name="/api/auth/callback/credentials",
            catch_response=True,
        ) as r:
            if "authjs.session-token" not in self.client.cookies.get_dict() and "__Secure-authjs.session-token" not in self.client.cookies.get_dict():
                r.failure("login failed (did you run `npm run loadtest:seed`?)")
            else:
                r.success()

    def payload(self, vehicle_id, start, end):
        return {"vehicleId": vehicle_id, "startAt": iso(start), "endAt": iso(end), "customer": {"fullName": f"Load User {self.index}", "email": self.email, "phone": "0700000000"}}

    def book(self, vehicle_id, start, end, name="POST /api/bookings"):
        with self.client.post("/api/bookings", json=self.payload(vehicle_id, start, end), name=name, catch_response=True) as r:
            if r.status_code in (201, 409, 429):
                r.success()
            else:
                r.failure(f"unexpected status {r.status_code}: {r.text[:120]}")
        return r.status_code


class Customer(LoggedIn):
    weight = 4

    @task(5)
    def browse(self):
        self.client.get("/vehicles?sort=price_asc", name="/vehicles?filters")
        self.client.get(f"/vehicles/{random.choice(VEHICLES)}", name="/vehicles/[id]")

    @task(3)
    def my_bookings(self):
        self.client.get("/account")
        self.client.get("/account/bookings", name="/account/bookings")

    @task(2)
    def book_free_slot(self):
        # A random vehicle (not the contested one) at a random hour on a random day: collisions are possible and expected.
        vehicle = random.choice(VEHICLES[1:])
        start = (datetime.now(timezone.utc) + timedelta(days=random.randint(5, 700))).replace(hour=random.randint(6, 18), minute=0, second=0, microsecond=0)
        self.book(vehicle, start, start + timedelta(hours=random.choice([2, 3, 4])))

    @task(1)
    def refused_cases(self):
        with self.client.post("/api/bookings", json={**self.payload(VEHICLES[1], datetime.now(timezone.utc) - timedelta(days=1), datetime.now(timezone.utc)), "customer": {"fullName": "x", "email": "other@example.test", "phone": "0700000000"}}, name="POST /api/bookings (refused)", catch_response=True) as r:
            r.success() if r.status_code == 400 else r.failure(f"expected 400, got {r.status_code}")


class SlotFighter(LoggedIn):
    weight = 1
    wait_time = between(0.05, 0.3)

    @task
    def book_contested_slot(self):
        global _contested_wins
        code = self.book(CONTESTED, CONTESTED_START, CONTESTED_END, name="POST /api/bookings (contested slot)")
        if code == 201:
            with _lock:
                _contested_wins += 1


@events.quitting.add_listener
def check_exactly_one_winner(environment, **_):
    if environment.runner is not None and environment.runner.__class__.__name__ == "WorkerRunner":
        return
    print(f"Contested slot {iso(CONTESTED_START)}: {_contested_wins} successful booking(s) seen by this process.")
    if _contested_wins > 1:
        print("FAILED: more than one booking won the same slot.")
        environment.process_exit_code = 1
    if environment.stats.total.num_failures > 0:
        environment.process_exit_code = 1
