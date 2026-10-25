import { beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

describe("the unique email index decides concurrent registrations", () => {
  it("two accounts with the same email cannot both be created, and the loser gets a unique-constraint error", async () => {
    const create = () => prisma.user.create({ data: { email: "same@test.example", name: "Same", passwordHash: "x", role: "CUSTOMER" } });
    const results = await Promise.allSettled([create(), create(), create()]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      const reason = (r as PromiseRejectedResult).reason;
      expect(reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      expect(reason.code).toBe("P2002");
    }
    expect(await prisma.user.count()).toBe(1);
  });
});
