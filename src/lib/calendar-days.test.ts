import { describe, expect, it } from "vitest";
import { bookingDays, busyDaySet, monthsFrom } from "./calendar-days";

const from = { year: 2030, month: 6, day: 1 };
const at = (iso: string) => new Date(iso);

describe("bookingDays (Bucharest calendar days, end exclusive)", () => {
  it("marks every day a booking touches", () => {
    // 10 June 12:00 -> 12 June 09:00 Bucharest (summer, UTC+3)
    expect(bookingDays(at("2030-06-10T09:00:00Z"), at("2030-06-12T06:00:00Z"), from, 90)).toEqual(["2030-06-10", "2030-06-11", "2030-06-12"]);
  });
  it("does not occupy the next day when it ends exactly at local midnight", () => {
    expect(bookingDays(at("2030-06-10T09:00:00Z"), at("2030-06-10T21:00:00Z"), from, 90)).toEqual(["2030-06-10"]); // ends 11 June 00:00 local
    expect(bookingDays(at("2030-06-10T09:00:00Z"), at("2030-06-10T21:00:01Z"), from, 90)).toEqual(["2030-06-10", "2030-06-11"]);
  });
  it("uses the Bucharest date, not the UTC one, around midnight", () => {
    // 22:30 UTC on 10 June is already 01:30 on 11 June in Bucharest
    expect(bookingDays(at("2030-06-10T22:30:00Z"), at("2030-06-10T23:30:00Z"), from, 90)).toEqual(["2030-06-11"]);
  });
  it("clips to the horizon and ignores bookings fully outside it", () => {
    expect(bookingDays(at("2030-05-28T09:00:00Z"), at("2030-06-02T09:00:00Z"), from, 90)).toEqual(["2030-06-01", "2030-06-02"]);
    expect(bookingDays(at("2030-05-20T09:00:00Z"), at("2030-05-22T09:00:00Z"), from, 90)).toEqual([]);
    expect(bookingDays(at("2030-09-10T09:00:00Z"), at("2030-09-11T09:00:00Z"), from, 90)).toEqual([]);
    expect(bookingDays(at("2030-08-28T09:00:00Z"), at("2030-09-03T09:00:00Z"), from, 90)).toEqual(["2030-08-28", "2030-08-29"]); // the 90 days end on 29 August
    expect(bookingDays(at("2030-08-30T09:00:00Z"), at("2030-09-03T09:00:00Z"), from, 90)).toEqual([]);
  });
  it("handles month and year ends and the clock changes", () => {
    expect(bookingDays(at("2030-06-29T09:00:00Z"), at("2030-07-02T09:00:00Z"), from, 90)).toEqual(["2030-06-29", "2030-06-30", "2030-07-01", "2030-07-02"]);
    const dec = { year: 2030, month: 12, day: 30 };
    expect(bookingDays(at("2030-12-31T10:00:00Z"), at("2031-01-01T10:00:00Z"), dec, 30)).toEqual(["2030-12-31", "2031-01-01"]);
    const oct = { year: 2030, month: 10, day: 25 };
    expect(bookingDays(at("2030-10-26T10:00:00Z"), at("2030-10-28T10:00:00Z"), oct, 10)).toEqual(["2030-10-26", "2030-10-27", "2030-10-28"]); // 27 Oct 2030 is the 25-hour day
  });
});

describe("busyDaySet and monthsFrom", () => {
  it("merges overlapping bookings", () => {
    const set = busyDaySet([{ startAt: at("2030-06-10T09:00:00Z"), endAt: at("2030-06-11T09:00:00Z") }, { startAt: at("2030-06-11T08:00:00Z"), endAt: at("2030-06-12T08:00:00Z") }], from, 90);
    expect([...set].sort()).toEqual(["2030-06-10", "2030-06-11", "2030-06-12"]);
  });
  it("lists consecutive months across a year end", () => {
    expect(monthsFrom({ year: 2030, month: 11, day: 15 }, 4)).toEqual([{ year: 2030, month: 11 }, { year: 2030, month: 12 }, { year: 2031, month: 1 }, { year: 2031, month: 2 }]);
  });
});
