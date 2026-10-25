"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { CURRENCY_COOKIE } from "@/lib/currency-server";
import { parseCurrency } from "@/lib/currency";

// Only same-site relative paths are accepted as a return target (no open redirect).
function safePath(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : "/";
}

export async function setCurrencyAction(formData: FormData) {
  const currency = parseCurrency(String(formData.get("currency")));
  (await cookies()).set(CURRENCY_COOKIE, currency, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  redirect(safePath(formData.get("returnTo")));
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
