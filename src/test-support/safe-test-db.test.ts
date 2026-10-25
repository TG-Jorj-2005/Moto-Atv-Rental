import { describe, expect, it } from "vitest";
import { assertRunningAgainstTestDatabase, assertSafeTestDatabase } from "./safe-test-db";

const DEV = "postgresql://rental:rental@localhost:5433/rental?schema=public";
const TEST = "postgresql://rental:rental@localhost:5433/rental_test?schema=public";

describe("assertSafeTestDatabase", () => {
  it("accepts a local database whose name ends with _test", () => {
    expect(assertSafeTestDatabase(TEST, DEV)).toEqual({ host: "127.0.0.1", port: "5433", database: "rental_test" });
  });
  it("refuses a missing or empty TEST_DATABASE_URL", () => {
    expect(() => assertSafeTestDatabase(undefined, DEV)).toThrow(/not set/);
    expect(() => assertSafeTestDatabase("  ", DEV)).toThrow(/not set/);
  });
  it("refuses the development database", () => {
    expect(() => assertSafeTestDatabase(DEV, DEV)).toThrow(/_test/);
  });
  it("refuses the same database spelled differently (localhost vs 127.0.0.1)", () => {
    expect(() =>
      assertSafeTestDatabase("postgresql://u:p@127.0.0.1:5433/rental_test", "postgresql://u:p@localhost:5433/rental_test"),
    ).toThrow(/same database/);
  });
  it("refuses names that do not end with _test", () => {
    for (const name of ["rental", "test", "testrental", "rental_test_backup", "production"]) {
      expect(() => assertSafeTestDatabase(`postgresql://u:p@localhost:5433/${name}`, undefined)).toThrow(/test database/);
    }
  });
  it("refuses remote hosts", () => {
    expect(() => assertSafeTestDatabase("postgresql://u:p@db.example.com:5432/rental_test", undefined)).toThrow(/not local/);
    expect(() => assertSafeTestDatabase("postgresql://u:p@10.0.0.5:5432/rental_test", undefined)).toThrow(/not local/);
  });
  it("refuses other schemes and garbage", () => {
    expect(() => assertSafeTestDatabase("mysql://u:p@localhost/rental_test", undefined)).toThrow(/postgresql/);
    expect(() => assertSafeTestDatabase("not a url", undefined)).toThrow(/valid URL/);
  });
  it("refuses an unparsable DATABASE_URL because it cannot be proven different", () => {
    expect(() => assertSafeTestDatabase(TEST, "garbage")).toThrow(/could not be parsed/);
  });
});

describe("assertRunningAgainstTestDatabase", () => {
  it("requires the launcher marker", () => {
    expect(() => assertRunningAgainstTestDatabase({ TEST_DATABASE_URL: TEST, DATABASE_URL: TEST })).toThrow(/npm run test:integration/);
  });
  it("requires DATABASE_URL to equal TEST_DATABASE_URL", () => {
    expect(() => assertRunningAgainstTestDatabase({ INTEGRATION: "1", TEST_DATABASE_URL: TEST, DATABASE_URL: DEV })).toThrow(/differs/);
    expect(() => assertRunningAgainstTestDatabase({ INTEGRATION: "1", TEST_DATABASE_URL: TEST })).toThrow(/differs/);
  });
  it("passes only when everything points to the same test database", () => {
    expect(assertRunningAgainstTestDatabase({ INTEGRATION: "1", TEST_DATABASE_URL: TEST, DATABASE_URL: TEST }).database).toBe("rental_test");
  });
});
