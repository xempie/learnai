import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap edge gate: bounce signed-out visitors away from authenticated pages
 * before they cost a server render.
 *
 * This checks only for the PRESENCE of the session cookie - it does not verify
 * the signature, and it is NOT an authorisation boundary. Every API route and
 * server component still calls `requireAuth()` / `requireAdmin()`, which verify
 * the JWT and load the user. A forged cookie gets past this and is rejected
 * there. Role checks deliberately do not happen here: middleware has no database
 * access, and a hidden UI element is not an access control.
 */

const SESSION_COOKIE = "acadu_session";

/** Signed-in-only page prefixes. */
const PROTECTED = ["/feed", "/me", "/org", "/settings", "/notifications", "/admin", "/dashboard", "/catalogue"];

/** Pages that make no sense once you are already signed in. */
const AUTH_PAGES = ["/login", "/signup"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    // Send them back where they were headed after signing in.
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_PAGES.includes(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = "/feed";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Skip API routes (they enforce auth themselves and must return JSON, not a
   * redirect), Next internals, and static files.
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|vtt|mp4)$).*)"],
};
