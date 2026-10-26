import Link from "next/link";
import { redirect } from "next/navigation";
import { hashPassword } from "@/lib/password";
import { Prisma } from "@prisma/client";
import { signIn } from "@/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { prisma } from "@/lib/db";
import { registerSchema } from "@/lib/forms";
import { homePathFor } from "@/lib/roles";
import { safeNextPath } from "@/lib/next-path";

export const metadata = { title: "Create an account" };

const MESSAGES: Record<string, string> = {
  invalid: "Check the fields: the name needs at least 2 characters and the password at least 8.",
  exists: "An account with this email already exists. Try logging in instead.",
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; role?: string }> }) {
  const { error, next, role: wantedRole } = await searchParams;
  const target = safeNextPath(next);

  async function register(formData: FormData) {
    "use server";
    const to = safeNextPath(String(formData.get("next") ?? ""));
    const parsed = registerSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) redirect("/register?error=invalid");
    const { name, email, password, role } = parsed.data;
    if (await prisma.user.findUnique({ where: { email } })) redirect("/register?error=exists");
    try {
      await prisma.user.create({ data: { name, email, role, passwordHash: await hashPassword(password) } });
    } catch (e) {
      // Two registrations with the same email at the same moment: the unique index decides, not the check above.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") redirect("/register?error=exists");
      throw e;
    }
    await signIn("credentials", { email, password, redirectTo: to !== "/" ? to : homePathFor(role) });
  }

  const defaultRole = wantedRole === "OWNER" || wantedRole === "RENTAL_COMPANY" ? wantedRole : "CUSTOMER";

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="text-sm text-muted">Rent vehicles, or list your own for rent.</p>
          </div>
          {error && <Alert tone="error">{MESSAGES[error] ?? "Something went wrong."}</Alert>}
          <form action={register} className="space-y-4">
            <input type="hidden" name="next" value={target} />
            <Field label="Full name or company name" htmlFor="name"><Input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} /></Field>
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Password" htmlFor="password" hint="At least 8 characters."><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} /></Field>
            <Field label="I want to…" htmlFor="role" hint="Only an administrator can change this later.">
              <Select id="role" name="role" defaultValue={defaultRole}>
                <option value="CUSTOMER">Rent vehicles</option>
                <option value="OWNER">Rent vehicles and list my own as an individual owner</option>
                <option value="RENTAL_COMPANY">Represent a rental company (list a fleet, request bulk offers)</option>
              </Select>
            </Field>
            <Button className="w-full" size="lg">Create account</Button>
          </form>
          <p className="text-center text-sm text-muted">
            Already registered? <Link href={`/login${target !== "/" ? `?next=${encodeURIComponent(target)}` : ""}`} className="font-semibold text-accent-fg hover:underline">Log in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
