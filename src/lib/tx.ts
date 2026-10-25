import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

// Interactive transactions wait for a pooled connection and for row locks, so the defaults of Prisma (2 s to start,
// 5 s to finish) are too tight when many requests hit the same vehicle at once.
export const TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

// Errors that mean "nothing was committed, simply run it again": a deadlock chosen as victim by PostgreSQL
// (40P01), a serialization failure (40001) or Prisma's own P2034.
export function isTransientTxError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const text = error instanceof Error ? error.message : "";
  return /deadlock detected|could not serialize access|40P01|40001/i.test(text);
}

const MAX_ATTEMPTS = 4;

// Runs `fn` in a transaction and retries it when it was rolled back for a transient reason. Because the whole
// transaction is repeated, no partial change and no extra history row can survive a retry.
export async function runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, TX_OPTIONS);
    } catch (error) {
      if (!isTransientTxError(error) || attempt >= MAX_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 45 * attempt));
    }
  }
}
