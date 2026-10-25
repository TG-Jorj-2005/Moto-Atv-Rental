import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { loadUserById } from "@/lib/current-user";
import { makeUser, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

describe("loadUserById (the source of truth for authorization)", () => {
  it("returns the role stored in the database", async () => {
    const user = await makeUser("OWNER", { name: "Ana" });
    expect(await loadUserById(user.id)).toMatchObject({ id: user.id, role: "OWNER", name: "Ana" });
  });
  it("reflects a demotion immediately, without any new login", async () => {
    const user = await makeUser("RENTAL_COMPANY");
    expect((await loadUserById(user.id))?.role).toBe("RENTAL_COMPANY");
    await prisma.user.update({ where: { id: user.id }, data: { role: "CUSTOMER" } });
    expect((await loadUserById(user.id))?.role).toBe("CUSTOMER");
  });
  it("returns null for a user that was deleted, so an old token proves nothing", async () => {
    const user = await makeUser("ADMIN");
    await prisma.user.delete({ where: { id: user.id } });
    expect(await loadUserById(user.id)).toBeNull();
    expect(await loadUserById("never-existed")).toBeNull();
  });
});
