import Link from "next/link";
import { Compass } from "lucide-react";
import { Brand } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="max-w-md space-y-5 text-center">
        <div className="flex justify-center"><Brand /></div>
        <Compass aria-hidden className="mx-auto size-12 text-accent-fg" />
        <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
        <p className="text-muted">The page you are looking for does not exist, was moved, or the vehicle is no longer listed.</p>
        <div className="flex justify-center gap-2">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>Home</Link>
          <Link href="/vehicles" className={buttonVariants()}>Browse vehicles</Link>
        </div>
      </div>
    </div>
  );
}
