import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  }

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" },
  });

  const vehicles = [
    { name: "Yamaha Grizzly 700", type: "ATV", plate: "GL-01-ATV", hourlyRate: 15000, dailyRate: 60000, weekendRate: 100000 },
    { name: "Can-Am Outlander 570", type: "ATV", plate: "GL-02-ATV", hourlyRate: 14000, dailyRate: 55000, weekendRate: 95000 },
    { name: "Honda CRF 300", type: "MOTORCYCLE", plate: "GL-03-MOT", hourlyRate: 12000, dailyRate: 45000, weekendRate: 80000 },
    { name: "Vespa Primavera 125", type: "SCOOTER", plate: "GL-04-SCO", hourlyRate: 5000, dailyRate: 20000, weekendRate: 35000 },
  ] as const;

  for (const v of vehicles) {
    await prisma.vehicle.upsert({ where: { plate: v.plate }, update: {}, create: v });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
