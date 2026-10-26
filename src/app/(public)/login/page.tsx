import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { safeNextPath } from "@/lib/next-path";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const target = safeNextPath(next);

  async function login(formData: FormData) {
    "use server";
    const to = safeNextPath(String(formData.get("next") ?? ""));
    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: to,
      });
    } catch (e) {
      if (e instanceof AuthError) redirect(`/login?error=1${to !== "/" ? `&next=${encodeURIComponent(to)}` : ""}`);
      throw e; // NEXT_REDIRECT must propagate
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
            <p className="text-sm text-muted">Log in to manage your bookings and vehicles.</p>
          </div>
          {error && <Alert tone="error">Wrong email or password.</Alert>}
          <form action={login} className="space-y-4">
            <input type="hidden" name="next" value={target} />
            <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
            <Button className="w-full" size="lg">Log in</Button>
          </form>
          <p className="text-center text-sm text-muted">
            New here? <Link href={`/register${target !== "/" ? `?next=${encodeURIComponent(target)}` : ""}`} className="font-semibold text-accent-fg hover:underline">Create an account</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
