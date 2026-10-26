import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { verifyAndUpgrade } from "@/lib/password-upgrade";
import { makeUser, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

async function userWithBcrypt(password: string) {
  const user = await makeUser("CUSTOMER");
  const passwordHash = bcrypt.hashSync(password, 4);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { id: user.id, passwordHash };
}
const stored = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).passwordHash;

describe("verifyAndUpgrade", () => {
  it("upgrades a bcrypt hash after a correct password and leaves it alone after a wrong one", async () => {
    const user = await userWithBcrypt("Legacy-pass-2030!");
    expect(await verifyAndUpgrade(user, "wrong")).toBe(false);
    expect(await stored(user.id)).toBe(user.passwordHash);
    expect(await verifyAndUpgrade(user, "Legacy-pass-2030!")).toBe(true);
    const now = await stored(user.id);
    expect(now.startsWith("scrypt$")).toBe(true);
    expect((await verifyPassword("Legacy-pass-2030!", now)).valid).toBe(true);
    // the second login uses the new hash and does not rewrite it
    expect(await verifyAndUpgrade({ id: user.id, passwordHash: now }, "Legacy-pass-2030!")).toBe(true);
    expect(await stored(user.id)).toBe(now);
  });

  it("lets many simultaneous logins of one account all succeed and ends with one valid scrypt hash", async () => {
    const user = await userWithBcrypt("Legacy-pass-2030!");
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyAndUpgrade(user, "Legacy-pass-2030!")));
    expect(results.every(Boolean)).toBe(true);
    const now = await stored(user.id);
    expect(now.startsWith("scrypt$")).toBe(true);
    expect((await verifyPassword("Legacy-pass-2030!", now)).valid).toBe(true);
    expect((await verifyPassword("other", now)).valid).toBe(false);
  });

  it("never overwrites a password that was changed while the login was being verified", async () => {
    const user = await userWithBcrypt("Old-pass-2030!");
    const changed = await hashPassword("New-pass-2030!");
    // the login read the old hash; before its upgrade ran, the user changed the password
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: changed } });
    expect(await verifyAndUpgrade(user, "Old-pass-2030!")).toBe(true); // it was valid against the hash it had read
    expect(await stored(user.id)).toBe(changed);
    expect((await verifyPassword("New-pass-2030!", changed)).valid).toBe(true);
  });
});
