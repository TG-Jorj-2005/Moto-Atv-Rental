import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Access denied" };

export default function ForbiddenPage() {
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-24 text-center">
      <ShieldAlert aria-hidden className="mx-auto size-12 text-red-700" />
      <h1 className="text-3xl font-bold tracking-tight">Access denied</h1>
      <p className="text-stone-600">Your account does not have permission to open this page. If you think this is a mistake, contact an administrator.</p>
      <div className="flex justify-center gap-2">
        <Link href="/" className={buttonVariants({ variant: "outline" })}>Home</Link>
        <Link href="/account" className={buttonVariants()}>My account</Link>
      </div>
    </div>
  );
}
