// Prepares the TEST database for the Locust scenarios (npm run loadtest:seed).
// Validates the target first, never touches the development database, and only adds rows (safe to repeat).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertSafeTestDatabase, UnsafeTestDatabaseError } from "../src/test-support/safe-test-db";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: TEST_DATABASE_URL may come from the real environment.
}

const USERS = Number(process.env.LOAD_USERS ?? 200);
const PASSWORD = process.env.LOAD_PASSWORD ?? "Load-test-2030!";

async function main() {
  const testUrl = process.env.TEST_DATABASE_URL;
  const target = assertSafeTestDatabase(testUrl, process.env.DATABASE_URL);
  console.log(`Seeding load-test data into "${target.database}" on ${target.host}:${target.port}.`);
  const prisma = new PrismaClient({ datasourceUrl: testUrl });
  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await prisma.user.createMany({
      data: Array.from({ length: USERS }, (_, i) => ({ email: `load.user${i}@example.test`, name: `Load User ${i}`, passwordHash, role: "CUSTOMER" as const })),
      skipDuplicates: true,
    });
    const vehicles = Array.from({ length: 12 }, (_, i) => ({
      name: `Load Vehicle ${i}`,
      type: i % 2 === 0 ? ("ATV" as const) : ("MOTORCYCLE" as const),
      plate: `LT-${String(i).padStart(2, "0")}`,
      hourlyRate: 10000,
      dailyRate: 40000,
      weekendRate: 70000,
      status: "AVAILABLE" as const,
      listingStatus: "APPROVED" as const,
    }));
    await prisma.vehicle.createMany({ data: vehicles, skipDuplicates: true });
    const rows = await prisma.vehicle.findMany({ where: { plate: { startsWith: "LT-" } }, orderBy: { plate: "asc" }, select: { id: true } });
    console.log(`Users: load.user0..${USERS - 1}@example.test, password from LOAD_PASSWORD (default in loadtests/README.md).`);
    console.log(`LOAD_VEHICLE_IDS=${rows.map((r) => r.id).join(",")}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof UnsafeTestDatabaseError ? `REFUSED: ${error.message}` : error);
  process.exit(1);
});
