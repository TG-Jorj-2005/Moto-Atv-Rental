// Launcher for `npm run test:integration`.
// Order matters: validate the target FIRST, and only then create/migrate/delete anything.
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertSafeTestDatabase, UnsafeTestDatabaseError } from "../src/test-support/safe-test-db";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: TEST_DATABASE_URL may come from the real environment.
}

async function main() {
  const testUrl = process.env.TEST_DATABASE_URL;
  const target = assertSafeTestDatabase(testUrl, process.env.DATABASE_URL);
  console.log(`Integration tests will use database "${target.database}" on ${target.host}:${target.port} (validated as a test database).`);

  // Create the test database if it does not exist yet. The name was validated above (/^[a-z0-9_]+_test$/).
  const maintenanceUrl = new URL(testUrl!);
  maintenanceUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: maintenanceUrl.toString() });
  try {
    const found = await admin.$queryRaw<{ one: number }[]>`SELECT 1 AS one FROM pg_database WHERE datname = ${target.database}`;
    if (found.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${target.database}"`);
      console.log(`Created database "${target.database}".`);
    }
  } finally {
    await admin.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: testUrl!, TEST_DATABASE_URL: testUrl!, INTEGRATION: "1" };
  execFileSync("npx", ["prisma", "migrate", "deploy"], { env, stdio: "inherit" });
  execFileSync("npx", ["vitest", "run", "--config", "vitest.integration.config.ts", ...process.argv.slice(2)], { env, stdio: "inherit" });
}

main().catch((error) => {
  if (error instanceof UnsafeTestDatabaseError) {
    console.error(`REFUSED: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
