import { beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { verifyPassword } from "./password";
import { prisma } from "@/lib/db";
import { changePassword, updateProfile } from "@/lib/profile-service";
import { makeUser, resetDatabase } from "@/test-support/db";

beforeEach(resetDatabase);

describe("updateProfile", () => {
  it("changes the name and keeps the booking contact record in step, never touching the email", async () => {
    const user = await makeUser("CUSTOMER", { email: "ana@test.example", name: "Ana" });
    await prisma.customer.create({ data: { email: "ana@test.example", fullName: "Ana", phone: "0700000001" } });
    expect(await updateProfile(user.id, { name: "  Ana Maria Pop ", phone: "0711111111" })).toEqual({ ok: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ name: "Ana Maria Pop", email: "ana@test.example" });
    expect(await prisma.customer.findUniqueOrThrow({ where: { email: "ana@test.example" } })).toMatchObject({ fullName: "Ana Maria Pop", phone: "0711111111" });
  });
  it("creates the contact record when a phone is given, keeps the old phone when it is left empty", async () => {
    const user = await makeUser("OWNER", { email: "o@test.example" });
    await updateProfile(user.id, { name: "Owner One", phone: "" });
    expect(await prisma.customer.count()).toBe(0);
    await updateProfile(user.id, { name: "Owner One", phone: "0722222222" });
    await updateProfile(user.id, { name: "Owner Renamed", phone: "" });
    expect(await prisma.customer.findUniqueOrThrow({ where: { email: "o@test.example" } })).toMatchObject({ fullName: "Owner Renamed", phone: "0722222222" });
  });
  it("only ever changes the account of the caller", async () => {
    const [a, b] = [await makeUser("CUSTOMER"), await makeUser("CUSTOMER", { name: "Untouched" })];
    await updateProfile(a.id, { name: "New Name", phone: "0700000000" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: b.id } })).name).toBe("Untouched");
  });
  it("rejects invalid values and unknown users without changing anything", async () => {
    const user = await makeUser("CUSTOMER", { name: "Keep Me" });
    for (const bad of [{ name: "A", phone: "" }, { name: "x".repeat(101), phone: "" }, { name: "Valid Name", phone: "123" }, { name: "Valid Name", phone: "1".repeat(21) }]) {
      expect(await updateProfile(user.id, bad)).toEqual({ ok: false, code: "INVALID" });
    }
    expect(await updateProfile("ghost", { name: "Valid Name", phone: "" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe("Keep Me");
  });
});

describe("changePassword", () => {
  async function userWithPassword(password: string) {
    const user = await makeUser("CUSTOMER");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 4) } });
    return user;
  }
  it("needs the correct current password and stores a new hash", async () => {
    const user = await userWithPassword("old-password-1");
    expect(await changePassword(user.id, "wrong", "brand-new-pass")).toEqual({ ok: false, code: "WRONG_PASSWORD" });
    expect(await changePassword(user.id, "old-password-1", "brand-new-pass")).toEqual({ ok: true });
    const { passwordHash } = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(passwordHash.startsWith("scrypt$")).toBe(true);
    expect((await verifyPassword("brand-new-pass", passwordHash)).valid).toBe(true);
    expect((await verifyPassword("old-password-1", passwordHash)).valid).toBe(false);
  });
  it("refuses short passwords, an unchanged password and unknown users", async () => {
    const user = await userWithPassword("old-password-1");
    expect(await changePassword(user.id, "old-password-1", "short")).toEqual({ ok: false, code: "INVALID" });
    expect(await changePassword(user.id, "old-password-1", "old-password-1")).toEqual({ ok: false, code: "SAME_PASSWORD" });
    expect(await changePassword("ghost", "x", "long-enough-pass")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect((await verifyPassword("old-password-1", (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).passwordHash)).valid).toBe(true);
  });
});
