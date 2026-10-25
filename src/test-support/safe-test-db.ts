// Guards for the integration tests: they delete data, so they must only ever run against a clearly
// identified local test database. Pure functions, no database access.

export type DbTarget = { host: string; port: string; database: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const TEST_DB_NAME = /^[a-z0-9_]+_test$/;

export class UnsafeTestDatabaseError extends Error {}

export function parseDbUrl(url: string): DbTarget {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeTestDatabaseError("Database URL is not a valid URL.");
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new UnsafeTestDatabaseError("Database URL must use the postgresql:// scheme.");
  }
  const host = parsed.hostname === "localhost" || parsed.hostname === "[::1]" || parsed.hostname === "::1" ? "127.0.0.1" : parsed.hostname;
  return { host, port: parsed.port || "5432", database: decodeURIComponent(parsed.pathname.replace(/^\//, "")) };
}

// Called by the launcher script BEFORE anything is migrated or deleted.
export function assertSafeTestDatabase(testUrl: string | undefined, devUrl: string | undefined): DbTarget {
  if (!testUrl?.trim()) throw new UnsafeTestDatabaseError("TEST_DATABASE_URL is not set. Refusing to run integration tests.");
  if (process.env.NODE_ENV === "production") throw new UnsafeTestDatabaseError("NODE_ENV is production. Refusing to run integration tests.");

  const target = parseDbUrl(testUrl);
  const rawHost = new URL(testUrl).hostname;
  if (!LOCAL_HOSTS.has(rawHost)) {
    throw new UnsafeTestDatabaseError(`Host "${rawHost}" is not local. Integration tests only run against localhost.`);
  }
  if (!TEST_DB_NAME.test(target.database)) {
    throw new UnsafeTestDatabaseError(`Database "${target.database}" is not clearly a test database (its name must end with "_test").`);
  }
  if (devUrl?.trim()) {
    let dev: DbTarget | null = null;
    try {
      dev = parseDbUrl(devUrl);
    } catch {
      // A DATABASE_URL we cannot parse cannot be proven different, so refuse.
      throw new UnsafeTestDatabaseError("DATABASE_URL could not be parsed, so it cannot be compared with TEST_DATABASE_URL.");
    }
    if (dev.host === target.host && dev.port === target.port && dev.database === target.database) {
      throw new UnsafeTestDatabaseError("TEST_DATABASE_URL points to the same database as DATABASE_URL (the development database).");
    }
  }
  return target;
}

// Called inside the test process: the code under test (src/lib/db.ts) reads DATABASE_URL,
// so it must be exactly the validated test URL.
export function assertRunningAgainstTestDatabase(env: Record<string, string | undefined>): DbTarget {
  if (env.INTEGRATION !== "1") throw new UnsafeTestDatabaseError("Integration tests must be started with `npm run test:integration`.");
  const target = assertSafeTestDatabase(env.TEST_DATABASE_URL, undefined);
  if (env.DATABASE_URL !== env.TEST_DATABASE_URL) {
    throw new UnsafeTestDatabaseError("DATABASE_URL differs from TEST_DATABASE_URL inside the test process. Refusing to touch it.");
  }
  return target;
}
