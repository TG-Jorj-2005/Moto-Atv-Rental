import Link from "next/link";
import { Brand } from "@/components/layout/site-header";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface text-fg-soft">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div className="space-y-3">
          <Brand />
          <p className="max-w-xs text-sm text-subtle">A marketplace for renting ATVs and motorcycles in Romania, from individual owners, rental companies and our own fleet.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-2 text-sm">
          <Link href="/vehicles" className="hover:text-white">Browse vehicles</Link>
          <Link href="/register" className="hover:text-white">Create an account</Link>
          <Link href="/#how-it-works" className="hover:text-white">How it works</Link>
          <Link href="/#locations" className="hover:text-white">Locations</Link>
          <Link href="/register" className="hover:text-white">List your vehicle</Link>
          <Link href="/login" className="hover:text-white">Log in</Link>
        </nav>
        <p className="text-xs text-subtle">
          Demonstration data: the vehicles, prices, addresses, phone numbers and opening hours shown on this site are fictional placeholders for a university project, not a real business. Photos are credited to their authors on the page where they appear.
        </p>
      </div>
    </footer>
  );
}
