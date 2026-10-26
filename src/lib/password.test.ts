import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("Correct-horse-2030!");
    expect(hash.startsWith("scrypt$32768$8$3$")).toBe(true);
    expect(await verifyPassword("Correct-horse-2030!", hash)).toEqual({ valid: true, needsRehash: false });
    expect((await verifyPassword("Correct-horse-2030?", hash)).valid).toBe(false);
  });
  it("salts every hash", async () => {
    expect(await hashPassword("same")).not.toBe(await hashPassword("same"));
  });
  it("accepts hashes made earlier with bcrypt and asks for them to be replaced", async () => {
    const old = bcrypt.hashSync("Old-password-2030!", 10);
    expect(await verifyPassword("Old-password-2030!", old)).toEqual({ valid: true, needsRehash: true });
    expect(await verifyPassword("nope", old)).toEqual({ valid: false, needsRehash: true });
  });
  it("asks for a rehash when the stored scrypt parameters are weaker than the current ones", async () => {
    const { scryptSync } = await import("node:crypto");
    const salt = Buffer.alloc(16, 7);
    const weak = ["scrypt", 16384, 8, 1, salt.toString("base64"), scryptSync("pw", salt, 64, { N: 16384, r: 8, p: 1 }).toString("base64")].join("$");
    expect(await verifyPassword("pw", weak)).toEqual({ valid: true, needsRehash: true });
  });
  it("treats malformed stored values as a failed login, never as an exception", async () => {
    for (const bad of ["", "plain", "scrypt$", "scrypt$3$8$1$AA==$AA==", "scrypt$32768$8$3$$", "scrypt$x$8$3$AA==$AA==", "md5$1$2$3$4$5"]) {
      expect((await verifyPassword("pw", bad)).valid).toBe(false);
    }
  });
  it("treats canonically equivalent Unicode passwords as equal", async () => {
    const hash = await hashPassword("café-2030!");
    expect((await verifyPassword("café-2030!", hash)).valid).toBe(true);
  });
});

describe("compatibility with the bcrypt-only code (rollback)", () => {
  it("verifies a bcrypt hash from another implementation (Openwall test vector for \"U*U\")", async () => {
    const vector = "$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW";
    expect((await verifyPassword("U*U", vector)).valid).toBe(true);
    expect((await verifyPassword("U*V", vector)).valid).toBe(false);
  });
  it("shows what the previous code does with an upgraded hash: bcryptjs.compare says false, so that user could no longer log in", async () => {
    const upgraded = await hashPassword("Right-pass-2030!");
    expect(await bcrypt.compare("Right-pass-2030!", upgraded)).toBe(false);
    expect(bcrypt.compareSync("Right-pass-2030!", upgraded)).toBe(false);
  });
  it("keeps bcrypt hashes valid for the previous code as long as they are not upgraded", () => {
    const untouched = bcrypt.hashSync("Right-pass-2030!", 4);
    expect(bcrypt.compareSync("Right-pass-2030!", untouched)).toBe(true);
  });
});
