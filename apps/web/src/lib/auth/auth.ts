import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getPool } from "@learn-ai/db";

/**
 * Auth.js (NextAuth) v5 configuration — the recommended default from
 * LEARN_AI_V1_BUILD_SPEC.md §2.2. This file (plus
 * `app/api/auth/[...nextauth]/route.ts`) is the only place `next-auth` is
 * imported directly; everything else in the app depends on
 * `lib/auth/provider.ts`'s `AuthProvider` interface instead.
 *
 * Session strategy is JWT, not the Postgres adapter's database-session
 * mode: the only provider wired up today is Credentials (email + password),
 * and NextAuth requires JWT sessions for Credentials sign-in regardless of
 * whether an adapter is configured. The `accounts` / `sessions` /
 * `verification_tokens` tables from the T03 migration exist for this
 * reason — ready for an OAuth provider or a switch to database sessions
 * later — but no `Adapter` object is wired in here yet, since one would go
 * entirely unused by a Credentials+JWT-only setup and risks bit-rotting.
 * `verification_tokens` IS used today, directly by
 * `lib/auth/provider.ts`'s `sendVerification` / `verifyEmailToken` (our own
 * signup-verification flow, independent of NextAuth's built-in Email
 * provider).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const { rows } = await getPool().query<{
          id: string;
          email: string;
          password_hash: string;
        }>(
          `SELECT u.id, u.email, c.password_hash
             FROM users u
             JOIN auth_credentials c ON c.user_id = u.id
            WHERE u.email = $1 AND u.deleted_at IS NULL`,
          [email],
        );
        const row = rows[0];
        if (!row) return null;

        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return null;

        return { id: row.id, email: row.email };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
  },
});
