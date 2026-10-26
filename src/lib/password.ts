import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import bcrypt from "bcryptjs";

// Password hashing. New hashes use scrypt from node:crypto, which runs on the libuv thread pool: unlike the pure
// JavaScript bcryptjs it never blocks the event loop, so a burst of logins no longer delays every other request.
// Parameters: N=2^15, r=8, p=3 (32 MiB), one of the equivalent scrypt settings in the OWASP Password Storage Cheat Sheet.
// Hashes made earlier with bcrypt (`$2a$` / `$2b$`) still verify and are replaced by a scrypt hash at the next login.
const N = 2 ** 15;
const R = 8;
const P = 3;
const KEY_LENGTH = 64;
const MAX_MEMORY = 128 * 1024 * 1024;
const PREFIX = "scrypt";

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r, p, maxmem: MAX_MEMORY };
  return new Promise((resolve, reject) => scrypt(password.normalize("NFKC"), salt, length, options, (error, key) => (error ? reject(error) : resolve(key))));
}

// Format: scrypt$N$r$p$salt(base64)$hash(base64)
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return [PREFIX, N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export type PasswordCheck = { valid: boolean; needsRehash: boolean };

export async function verifyPassword(password: string, stored: string): Promise<PasswordCheck> {
  if (stored.startsWith("$2")) {
    return { valid: await bcrypt.compare(password, stored), needsRehash: true };
  }
  const [prefix, n, r, p, salt, hash] = stored.split("$");
  if (prefix !== PREFIX || !salt || !hash) return { valid: false, needsRehash: false };
  const [nn, rr, pp] = [Number(n), Number(r), Number(p)];
  if (![nn, rr, pp].every(Number.isInteger) || nn < 2 || (nn & (nn - 1)) !== 0 || rr < 1 || pp < 1) return { valid: false, needsRehash: false };
  const expected = Buffer.from(hash, "base64");
  let actual: Buffer;
  try {
    actual = await derive(password, Buffer.from(salt, "base64"), nn, rr, pp, expected.length);
  } catch {
    return { valid: false, needsRehash: false };
  }
  const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
  return { valid, needsRehash: valid && (nn !== N || rr !== R || pp !== P) };
}

// Unknown e-mail addresses cost the same time as wrong passwords, so the response time does not reveal which accounts exist.
let dummyHash: Promise<string> | null = null;
export async function spendVerificationTime(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(12).toString("hex"));
  await verifyPassword(password, await dummyHash);
}
