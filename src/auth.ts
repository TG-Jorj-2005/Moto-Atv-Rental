import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { spendVerificationTime } from "@/lib/password";
import { verifyAndUpgrade } from "@/lib/password-upgrade";

const credentialsSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

// The token carries only the user id. Roles are always read from the database (see src/lib/session.ts).
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
        if (!user) {
          await spendVerificationTime(parsed.data.password);
          return null;
        }
        if (!(await verifyAndUpgrade(user, parsed.data.password))) return null;
        return { id: user.id, email: user.email, name: user.name || user.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      return session;
    },
  },
});
