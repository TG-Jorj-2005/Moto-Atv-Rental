import { describe, expect, it } from "vitest";
import type { VehicleStatus } from "@prisma/client";
import { canChangeVehicleStatus, displayStatus, isTakingOutOfCirculation, nextVehicleStatuses } from "./vehicle-rules";

const ALL: VehicleStatus[] = ["AVAILABLE", "RENTED", "IN_SERVICE", "RETIRED"];

describe("vehicle status transitions", () => {
  it("allows exactly the approved ones", () => {
    expect(nextVehicleStatuses("AVAILABLE")).toEqual(["IN_SERVICE", "RETIRED"]);
    expect(nextVehicleStatuses("IN_SERVICE")).toEqual(["AVAILABLE", "RETIRED"]);
    expect(nextVehicleStatuses("RETIRED")).toEqual(["IN_SERVICE"]);
  });
  it("never goes straight from RETIRED to AVAILABLE", () => {
    expect(canChangeVehicleStatus("RETIRED", "AVAILABLE")).toBe(false);
    expect(canChangeVehicleStatus("RETIRED", "IN_SERVICE")).toBe(true);
  });
  it("never reads or writes RENTED, which is derived", () => {
    for (const s of ALL) {
      expect(canChangeVehicleStatus(s, "RENTED")).toBe(false);
      expect(canChangeVehicleStatus("RENTED", s)).toBe(false);
    }
    expect(nextVehicleStatuses("RENTED")).toEqual([]);
  });
  it("refuses a change to the same status", () => {
    for (const s of ["AVAILABLE", "IN_SERVICE", "RETIRED"] as const) expect(canChangeVehicleStatus(s, s)).toBe(false);
  });
  it("knows which targets take a vehicle out of circulation", () => {
    expect(["AVAILABLE", "IN_SERVICE", "RETIRED"].map((s) => isTakingOutOfCirculation(s as VehicleStatus))).toEqual([false, true, true]);
  });
});

describe("displayStatus (RENTED is derived)", () => {
  it("shows RENTED only for an available vehicle that has an ACTIVE booking", () => {
    expect(displayStatus("AVAILABLE", true)).toBe("RENTED");
    expect(displayStatus("AVAILABLE", false)).toBe("AVAILABLE"); // future bookings do not make it RENTED
  });
  it("never lets a booking override IN_SERVICE or RETIRED", () => {
    for (const hasActive of [true, false]) {
      expect(displayStatus("IN_SERVICE", hasActive)).toBe("IN_SERVICE");
      expect(displayStatus("RETIRED", hasActive)).toBe("RETIRED");
    }
  });
});
