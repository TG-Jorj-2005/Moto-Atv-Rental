import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createListing, ListingForbiddenError } from "@/lib/listings";
import { makeUser, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

const data = (plate: string) => ({ name: "Polaris", type: "ATV" as const, plate, hourlyRate: 10000, dailyRate: 40000 });

describe("createListing", () => {
  it("creates a PENDING listing owned by an owner or a rental company", async () => {
    for (const role of ["OWNER", "RENTAL_COMPANY"] as const) {
      const user = await makeUser(role);
      const vehicle = await createListing(user.id, data(`OK-${role}`));
      expect(vehicle).toMatchObject({ ownerId: user.id, listingStatus: "PENDING" });
    }
  });
  it("refuses customers, admins and unknown users, and creates nothing", async () => {
    for (const role of ["CUSTOMER", "ADMIN"] as const) {
      const user = await makeUser(role);
      await expect(createListing(user.id, data(`NO-${role}`))).rejects.toBeInstanceOf(ListingForbiddenError);
    }
    await expect(createListing("ghost", data("NO-GHOST"))).rejects.toBeInstanceOf(ListingForbiddenError);
    expect(await prisma.vehicle.count()).toBe(0);
  });
  it("rejects a duplicate plate with a unique-constraint error", async () => {
    const user = await makeUser("OWNER");
    await createListing(user.id, data("DUP-1"));
    await expect(createListing(user.id, data("DUP-1"))).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
