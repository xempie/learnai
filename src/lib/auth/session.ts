import "server-only";

import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ApiError } from "@/lib/api";
import { config } from "@/lib/config";

export const SESSION_COOKIE = "acadu_session";
const SESSION_DAYS = 30;

export interface SessionClaims {
  /** Cognito sub, or the local user id in dev-auth mode. */
  sub: string;
  email: string;
}

export type Role = "learner" | "instructor" | "org_admin" | "content_reviewer" | "platform_admin";

/** Roles that may reach /admin. */
const ADMIN_ROLES: Role[] = ["content_reviewer", "platform_admin"];

export interface SessionUser {
  id: string;
  cognitoSub: string;
  email: string;
  emailDomain: string;
  emailVerified: boolean;
  nickname: string;
  avatarKey: string | null;
  role: Role;
  orgId: string | null;
  orgVisible: boolean;
  isFoundingMember: boolean;
  isSuspended: boolean;
  onboardedAt: Date | null;
  trialEndsAt: Date | null;
  timezone: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(config.sessionSecret);
}

export async function createSession(claims: SessionClaims): Promise<void> {
  const token = await new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function readClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return { sub: payload.sub, email: String(payload.email ?? "") };
  } catch {
    return null;
  }
}

/** The signed-in user, or null. Safe to call from server components. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const claims = await readClaims();
  if (!claims) return null;

  const row = await db.query.users.findFirst({
    where: eq(users.cognitoSub, claims.sub),
  });
  if (!row || row.deletedAt) return null;

  return {
    id: row.id,
    cognitoSub: row.cognitoSub,
    email: row.email,
    emailDomain: row.emailDomain,
    emailVerified: row.emailVerified,
    nickname: row.nickname,
    avatarKey: row.avatarKey,
    role: row.role as Role,
    orgId: row.orgId,
    orgVisible: row.orgVisible,
    isFoundingMember: row.isFoundingMember,
    isSuspended: row.isSuspended,
    onboardedAt: row.onboardedAt,
    trialEndsAt: row.trialEndsAt,
    timezone: row.timezone,
  };
}

/** Throws 401 when signed out, 403 when suspended. */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("UNAUTHENTICATED", "Sign in to continue.");
  if (user.isSuspended) {
    throw new ApiError("FORBIDDEN", "This account is suspended.");
  }
  return user;
}

/** Throws unless the user holds one of the given roles. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new ApiError("FORBIDDEN", "You do not have access to this resource.");
  }
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole(...ADMIN_ROLES);
}

export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.includes(role);
}
