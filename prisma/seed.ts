import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { CATEGORY_BLURBS } from "../src/lib/vehicle-categories";

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

  // DEMO DATA: demonstration listings of the platform's own fleet (no owner, 0% commission). The models are real and
  // the specifications (year, displacement, power) follow the manufacturers' published data for that model year; where a
  // maker publishes power only in kW the figure is converted to hp, and where it publishes none the field is empty.
  // Plates, prices, locations and availability are invented. Photos come from Wikimedia Commons (credits in
  // src/lib/photo-credits.json).
  type Demo = {
    name: string; type: "ATV" | "MOTORCYCLE" | "SCOOTER"; category: Category; plate: string; daily: number; slug: string;
    year: number; engineCc: number; powerHp: number | null; seats: number | null; licenseCategory: string | null; location: string;
  };
  type Category = "CRUISER" | "ADVENTURE" | "NAKED_SPORT" | "DUAL_SPORT" | "ATV_SPORT" | "ATV_UTILITY";
  const vehicles: Demo[] = [
    // Cruiser
    { name: "Honda Rebel 500", type: "MOTORCYCLE", category: "CRUISER", plate: "BC-11-MOT", daily: 42000, slug: "honda-rebel-500", year: 2024, engineCc: 471, powerHp: 46, seats: 2, licenseCategory: "A2", location: "Bucharest North" },
    { name: "Honda Rebel 1100", type: "MOTORCYCLE", category: "CRUISER", plate: "CJ-12-MOT", daily: 62000, slug: "honda-rebel-1100", year: 2024, engineCc: 1084, powerHp: 88, seats: 2, licenseCategory: "A", location: "Cluj Hills" },
    { name: "Kawasaki Vulcan S", type: "MOTORCYCLE", category: "CRUISER", plate: "TM-13-MOT", daily: 48000, slug: "kawasaki-vulcan-s", year: 2024, engineCc: 649, powerHp: 61, seats: 2, licenseCategory: "A", location: "Timisoara West" },
    { name: "Harley-Davidson Fat Boy 114", type: "MOTORCYCLE", category: "CRUISER", plate: "CT-14-MOT", daily: 82000, slug: "harley-davidson-fat-boy-114", year: 2024, engineCc: 1868, powerHp: 94, seats: 2, licenseCategory: "A", location: "Constanta Seaside" },
    // Adventure and touring
    { name: "BMW R 1300 GS", type: "MOTORCYCLE", category: "ADVENTURE", plate: "BV-15-MOT", daily: 95000, slug: "bmw-r1300gs", year: 2024, engineCc: 1300, powerHp: 145, seats: 2, licenseCategory: "A", location: "Brasov Mountain Base" },
    { name: "Honda Africa Twin", type: "MOTORCYCLE", category: "ADVENTURE", plate: "SV-16-MOT", daily: 78000, slug: "honda-africa-twin", year: 2024, engineCc: 1084, powerHp: 102, seats: 2, licenseCategory: "A", location: "Suceava Bucovina Hub" },
    { name: "Yamaha Tenere 700", type: "MOTORCYCLE", category: "ADVENTURE", plate: "TM-08-MOT", daily: 64000, slug: "yamaha-tenere-700", year: 2024, engineCc: 689, powerHp: 73, seats: 2, licenseCategory: "A", location: "Timisoara West" },
    // Naked and sport
    { name: "Yamaha MT-07", type: "MOTORCYCLE", category: "NAKED_SPORT", plate: "IS-17-MOT", daily: 46000, slug: "yamaha-mt-07", year: 2024, engineCc: 689, powerHp: 73, seats: 2, licenseCategory: "A", location: "Iasi Campus Point" },
    { name: "Kawasaki Z900", type: "MOTORCYCLE", category: "NAKED_SPORT", plate: "BH-18-MOT", daily: 64000, slug: "kawasaki-z900", year: 2024, engineCc: 948, powerHp: 124, seats: 2, licenseCategory: "A", location: "Oradea Crisana" },
    { name: "Honda CBR650R", type: "MOTORCYCLE", category: "NAKED_SPORT", plate: "BC-19-MOT", daily: 56000, slug: "honda-cbr650r", year: 2023, engineCc: 649, powerHp: 95, seats: 2, licenseCategory: "A", location: "Bucharest North" },
    // Dual-sport and enduro
    { name: "Honda CRF300L", type: "MOTORCYCLE", category: "DUAL_SPORT", plate: "GL-03-MOT", daily: 38000, slug: "honda-crf300l", year: 2024, engineCc: 286, powerHp: 27, seats: null, licenseCategory: "A2", location: "Galati Center" },
    { name: "KTM 350 EXC-F", type: "MOTORCYCLE", category: "DUAL_SPORT", plate: "SB-07-MOT", daily: 52000, slug: "ktm-350-exc-f", year: 2024, engineCc: 350, powerHp: 51, seats: 1, licenseCategory: null, location: "Sibiu Old Town Garage" },
    // ATVs
    { name: "CFMOTO CFORCE 850 XC", type: "ATV", category: "ATV_UTILITY", plate: "CJ-06-ATV", daily: 56000, slug: "cfmoto-cforce-850-xc", year: 2024, engineCc: 800, powerHp: 60, seats: null, licenseCategory: null, location: "Cluj Hills" },
    { name: "Can-Am Outlander 570", type: "ATV", category: "ATV_UTILITY", plate: "GL-02-ATV", daily: 55000, slug: "can-am-outlander-570", year: 2022, engineCc: 570, powerHp: 48, seats: null, licenseCategory: null, location: "Galati Riverside" },
    { name: "Polaris Sportsman 570", type: "ATV", category: "ATV_UTILITY", plate: "BV-05-ATV", daily: 58000, slug: "polaris-sportsman-570", year: 2024, engineCc: 567, powerHp: 44, seats: null, licenseCategory: null, location: "Brasov Mountain Base" },
    { name: "Yamaha Grizzly 700", type: "ATV", category: "ATV_UTILITY", plate: "GL-01-ATV", daily: 60000, slug: "yamaha-grizzly-700", year: 2024, engineCc: 686, powerHp: null, seats: null, licenseCategory: null, location: "Galati Riverside" },
    { name: "Yamaha Raptor 700", type: "ATV", category: "ATV_SPORT", plate: "BR-20-ATV", daily: 52000, slug: "yamaha-raptor-700", year: 2024, engineCc: 686, powerHp: null, seats: 1, licenseCategory: null, location: "Braila Trail Base" },
  ];

  for (const { location, slug, daily, ...v } of vehicles) {
    const description = `Demo listing: ${v.name}, ${CATEGORY_BLURBS[v.category].charAt(0).toLowerCase()}${CATEGORY_BLURBS[v.category].slice(1)} Model year ${v.year}, specifications as published by the manufacturer. Helmet and basic equipment on request. Prices and availability are demonstration data.`;
    const rates = { hourlyRate: Math.round(daily / 4 / 100) * 100, dailyRate: daily, weekendRate: Math.round((daily * 1.7) / 100) * 100 };
    const locationId = locationIds[location];
    const row = await prisma.vehicle.upsert({
      where: { plate: v.plate },
      // Prices are only set when the vehicle is created: an administrator's later price changes survive a re-seed.
      update: { name: v.name, type: v.type, category: v.category, description, year: v.year, engineCc: v.engineCc, powerHp: v.powerHp, seats: v.seats, licenseCategory: v.licenseCategory, locationId },
      create: { ...v, ...rates, description, locationId },
    });
    // The demonstration photos are static files; uploaded photos are never touched.
    await prisma.vehiclePhoto.deleteMany({ where: { vehicleId: row.id, OR: [{ path: { startsWith: "/vehicles/" } }, { path: { startsWith: "/gallery/" } }] } });
    await prisma.vehiclePhoto.create({ data: { vehicleId: row.id, path: `/vehicles/${slug}.jpg`, position: 0 } });
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
