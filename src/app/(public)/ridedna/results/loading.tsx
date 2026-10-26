import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6" role="status" aria-label="Finding your rides">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid gap-5 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[34rem] rounded-2xl" />)}</div>
    </div>
  );
}
