import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const formatRon = (bani: number) => `${(bani / 100).toFixed(0)} RON`;

export default async function CatalogPage() {
  const vehicles = await prisma.vehicle.findMany({
    where: { status: "AVAILABLE" },
    orderBy: { name: "asc" },
  });

  return (
    <main>
      <h1 className="mb-6 text-2xl font-bold">Vehicle catalog</h1>
      <ul className="grid gap-4">
        {vehicles.map((v) => (
          <li key={v.id} className="flex items-center justify-between rounded border p-4">
            <div>
              <p className="font-semibold">{v.name}</p>
              <p className="text-sm text-neutral-600">
                {v.type} · {formatRon(v.hourlyRate)}/h · {formatRon(v.dailyRate)}/day
              </p>
            </div>
            <Link href={`/book/${v.id}`} className="rounded bg-neutral-900 px-4 py-2 text-white">
              Book
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
