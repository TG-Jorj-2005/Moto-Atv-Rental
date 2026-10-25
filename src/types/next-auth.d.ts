import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    // Identity only. The role is deliberately not part of the session: read it with getCurrentUser().
    user: { id: string } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
  }
}
