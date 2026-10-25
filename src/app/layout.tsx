import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ATV & Motorcycle Rental",
  description: "Rent ATVs, motorcycles and scooters",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="mx-auto max-w-3xl p-6 text-neutral-900">{children}</body>
    </html>
  );
}
