import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/session";
import { ROLE_LABEL } from "@/lib/roles";
import { changePassword, updateProfile } from "@/lib/profile-service";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";

export const metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

const MESSAGES: Record<string, string> = {
  INVALID: "Check the fields: the name needs at least 2 characters, the phone 7 to 20, the new password at least 8.",
  WRONG_PASSWORD: "The current password is not correct.",
  SAME_PASSWORD: "The new password must be different from the current one.",
  NOT_FOUND: "Your account was not found.",
};

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const user = await requireRole("CUSTOMER", "OWNER", "RENTAL_COMPANY");
  const { ok, error } = await searchParams;
  const contact = await prisma.customer.findUnique({ where: { email: user.email.toLowerCase() }, select: { phone: true } });

  async function save(formData: FormData) {
    "use server";
    const me = await requireRole("CUSTOMER", "OWNER", "RENTAL_COMPANY");
    const result = await updateProfile(me.id, { name: String(formData.get("name") ?? ""), phone: String(formData.get("phone") ?? "") });
    revalidatePath("/account", "layout");
    redirect(result.ok ? "/account/profile?ok=profile" : `/account/profile?error=${result.code}`);
  }

  async function password(formData: FormData) {
    "use server";
    const me = await requireRole("CUSTOMER", "OWNER", "RENTAL_COMPANY");
    const result = await changePassword(me.id, String(formData.get("current") ?? ""), String(formData.get("next") ?? ""));
    redirect(result.ok ? "/account/profile?ok=password" : `/account/profile?error=${result.code}`);
  }

  return (
    <>
      <PageHeader title="Profile" description="Your contact details and password." />
      {ok && <Alert tone="success">{ok === "password" ? "Your password was changed." : "Your profile was saved."}</Alert>}
      {error && <Alert tone="error">{MESSAGES[error] ?? "Something went wrong."}</Alert>}
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Contact details</CardTitle><CardDescription>Used for your bookings. Account type: {ROLE_LABEL[user.role]}.</CardDescription></CardHeader>
          <CardContent>
            <form action={save} className="space-y-4">
              <Field label="Full name" htmlFor="name"><Input id="name" name="name" defaultValue={user.name} required minLength={2} maxLength={100} autoComplete="name" /></Field>
              <Field label="Phone" htmlFor="phone" hint="So that we can reach you about a handover."><Input id="phone" name="phone" type="tel" defaultValue={contact?.phone && contact.phone !== "n/a" ? contact.phone : ""} minLength={7} maxLength={20} autoComplete="tel" /></Field>
              <Field label="Email" htmlFor="email" hint="The email is the identity of your account and cannot be changed here."><Input id="email" value={user.email} readOnly /></Field>
              <Button>Save changes</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
          <CardContent>
            <form action={password} className="space-y-4">
              <Field label="Current password" htmlFor="current"><Input id="current" name="current" type="password" required autoComplete="current-password" /></Field>
              <Field label="New password" htmlFor="next" hint="At least 8 characters."><Input id="next" name="next" type="password" required minLength={8} autoComplete="new-password" /></Field>
              <Button variant="dark">Change password</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
