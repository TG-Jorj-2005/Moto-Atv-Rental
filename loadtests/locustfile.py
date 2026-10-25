"""Many users try to book the same vehicle for the same period.

Expected: exactly one 201, all others 409, no duplicate rows.
Set VEHICLE_ID to an id from the seeded `vehicles` table.
"""
import os
import uuid

from locust import HttpUser, between, task

VEHICLE_ID = os.environ["VEHICLE_ID"]
START = "2030-06-01T10:00:00Z"
END = "2030-06-01T14:00:00Z"


class SameSlotBooker(HttpUser):
    wait_time = between(0.1, 0.5)

    @task
    def book_same_slot(self):
        uid = uuid.uuid4().hex[:8]
        payload = {
            "vehicleId": VEHICLE_ID,
            "startAt": START,
            "endAt": END,
            "customer": {
                "fullName": f"Load User {uid}",
                "email": f"load-{uid}@example.com",
                "phone": "0700000000",
            },
        }
        with self.client.post("/api/bookings", json=payload, catch_response=True) as r:
            if r.status_code in (201, 409):
                r.success()
            else:
                r.failure(f"unexpected status {r.status_code}")
