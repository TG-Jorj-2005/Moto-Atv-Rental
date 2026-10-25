import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set");
  }

  // Docker start-up: seed only a brand new database, so a restart never resets what the administrator changed.
  if (process.env.SEED_IF_EMPTY === "true" && (await prisma.user.count()) > 0) {
    console.log("Database already has users: seed skipped.");
    return;
  }

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: "Admin", passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" },
  });

  // DEMO DATA: every address and phone number below is fictional placeholder data, not a real business.
  const locations = [
    { name: "Galati Center", city: "Galati", county: "Galati", address: "Demo Street 1 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sun 08:00-20:00" },
    { name: "Galati Riverside", city: "Galati", county: "Galati", address: "Demo Street 2 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sun 09:00-21:00" },
    { name: "Braila Trail Base", city: "Braila", county: "Braila", address: "Demo Street 3 (fictional address)", phone: "+40 000 000 000", hours: "Tue-Sun 09:00-19:00" },
    { name: "Bucharest North", city: "Bucuresti", county: "Bucuresti", address: "Demo Street 4 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sun 08:00-21:00" },
    { name: "Cluj Hills", city: "Cluj-Napoca", county: "Cluj", address: "Demo Street 5 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sun 09:00-20:00" },
    { name: "Brasov Mountain Base", city: "Brasov", county: "Brasov", address: "Demo Street 6 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sun 08:00-20:00" },
    { name: "Sibiu Old Town Garage", city: "Sibiu", county: "Sibiu", address: "Demo Street 7 (fictional address)", phone: "+40 000 000 000", hours: "Tue-Sun 09:00-19:00" },
    { name: "Timisoara West", city: "Timisoara", county: "Timis", address: "Demo Street 8 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sun 09:00-20:00" },
    { name: "Iasi Campus Point", city: "Iasi", county: "Iasi", address: "Demo Street 9 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sat 09:00-19:00" },
    { name: "Constanta Seaside", city: "Constanta", county: "Constanta", address: "Demo Street 10 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sun 09:00-22:00" },
    { name: "Suceava Bucovina Hub", city: "Suceava", county: "Suceava", address: "Demo Street 11 (fictional address)", phone: "+40 000 000 000", hours: "Tue-Sun 09:00-18:00" },
    { name: "Oradea Crisana", city: "Oradea", county: "Bihor", address: "Demo Street 12 (fictional address)", phone: "+40 000 000 000", hours: "Mon-Sat 09:00-19:00" },
  ];
  const locationIds: Record<string, string> = {};
  for (const l of locations) {
    const row = await prisma.location.upsert({ where: { name: l.name }, update: l, create: l });
    locationIds[l.name] = row.id;
  }

  // DEMO DATA: all vehicles below are demonstration listings of the platform's own fleet (no owner, 0% commission).
  type Demo = {
    name: string; type: "ATV" | "MOTORCYCLE" | "SCOOTER"; plate: string; hourlyRate: number; dailyRate: number; weekendRate: number;
    year: number; engineCc: number; powerHp: number; seats: number; licenseCategory: string | null; location: string; photos: string[];
  };
  const vehicles: Demo[] = [
    { name: "Yamaha Grizzly 700", type: "ATV", plate: "GL-01-ATV", hourlyRate: 15000, dailyRate: 60000, weekendRate: 100000, year: 2022, engineCc: 686, powerHp: 50, seats: 2, licenseCategory: null, location: "Galati Riverside", photos: ["/vehicles/yamaha-grizzly-700.jpg", "/gallery/g6.jpg"] },
    { name: "Can-Am Outlander 570", type: "ATV", plate: "GL-02-ATV", hourlyRate: 14000, dailyRate: 55000, weekendRate: 95000, year: 2022, engineCc: 570, powerHp: 48, seats: 2, licenseCategory: null, location: "Braila Trail Base", photos: ["/vehicles/can-am-outlander-570.jpg", "/gallery/g2.jpg"] },
    { name: "Honda CRF 300", type: "MOTORCYCLE", plate: "GL-03-MOT", hourlyRate: 12000, dailyRate: 45000, weekendRate: 80000, year: 2023, engineCc: 286, powerHp: 27, seats: 1, licenseCategory: "A2", location: "Galati Center", photos: ["/vehicles/honda-crf-300.jpg", "/gallery/g3.jpg"] },
    { name: "Vespa Primavera 125", type: "SCOOTER", plate: "GL-04-SCO", hourlyRate: 5000, dailyRate: 20000, weekendRate: 35000, year: 2023, engineCc: 125, powerHp: 12, seats: 2, licenseCategory: "A1", location: "Galati Center", photos: ["/vehicles/vespa-primavera-125.jpg", "/gallery/g5.jpg"] },
    { name: "Polaris Sportsman 570", type: "ATV", plate: "BV-05-ATV", hourlyRate: 14500, dailyRate: 58000, weekendRate: 98000, year: 2023, engineCc: 567, powerHp: 44, seats: 2, licenseCategory: null, location: "Brasov Mountain Base", photos: ["/gallery/g1.jpg", "/gallery/g2.jpg"] },
    { name: "CFMoto CForce 520", type: "ATV", plate: "CJ-06-ATV", hourlyRate: 12000, dailyRate: 48000, weekendRate: 84000, year: 2022, engineCc: 495, powerHp: 32, seats: 2, licenseCategory: null, location: "Cluj Hills", photos: ["/gallery/g2.jpg", "/gallery/g6.jpg"] },
    { name: "KTM 350 EXC-F", type: "MOTORCYCLE", plate: "SB-07-MOT", hourlyRate: 13000, dailyRate: 52000, weekendRate: 90000, year: 2023, engineCc: 350, powerHp: 40, seats: 1, licenseCategory: "A2", location: "Sibiu Old Town Garage", photos: ["/gallery/g3.jpg"] },
    { name: "Yamaha Tenere 700", type: "MOTORCYCLE", plate: "TM-08-MOT", hourlyRate: 16000, dailyRate: 64000, weekendRate: 110000, year: 2022, engineCc: 689, powerHp: 73, seats: 2, licenseCategory: "A", location: "Timisoara West", photos: ["/gallery/g3.jpg", "/gallery/g1.jpg"] },
    { name: "Suzuki DR-Z400SM", type: "MOTORCYCLE", plate: "CT-09-MOT", hourlyRate: 11000, dailyRate: 44000, weekendRate: 76000, year: 2021, engineCc: 398, powerHp: 38, seats: 1, licenseCategory: "A2", location: "Constanta Seaside", photos: ["/gallery/g3.jpg"] },
  ];

  for (const { location, photos, ...v } of vehicles) {
    const description = `Demo listing: ${v.name}, a ${v.type === "ATV" ? "quad" : v.type === "SCOOTER" ? "scooter" : "motorcycle"} of the platform's own fleet. Helmet and basic equipment on request. Prices and details are demonstration data.`;
    const data = { ...v, description, locationId: locationIds[location] };
    const row = await prisma.vehicle.upsert({
      where: { plate: v.plate },
      update: { description, year: v.year, engineCc: v.engineCc, powerHp: v.powerHp, seats: v.seats, licenseCategory: v.licenseCategory, locationId: data.locationId },
      create: data,
    });
    // The demonstration photos are static files; uploaded photos are never touched.
    await prisma.vehiclePhoto.deleteMany({ where: { vehicleId: row.id, OR: [{ path: { startsWith: "/vehicles/" } }, { path: { startsWith: "/gallery/" } }] } });
    await prisma.vehiclePhoto.createMany({ data: photos.map((path, position) => ({ vehicleId: row.id, path, position })) });
  }

  if (process.env.SEED_DEMO_USERS === "true") {
    const { seedDemoAccounts } = await import("./seed-demo");
    await seedDemoAccounts(prisma, locationIds);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
