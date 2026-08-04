import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import {
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ConfirmSignUpCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ResendConfirmationCodeCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { ApiError } from "@/lib/api";
import { config } from "@/lib/config";

/**
 * Two identity backends behind one interface:
 *
 *  - Cognito (production): email/password plus Google federation via the Hosted UI.
 *  - Dev store (no COGNITO_USER_POOL_ID): credentials hashed with PBKDF2 in the
 *    local `users` table so the whole product runs without an AWS account.
 *
 * Callers never branch on which is active - only `config.devAuth` does.
 */

export interface SignUpResult {
  /** Cognito sub, or a generated id in dev mode. */
  sub: string;
  /** False when a verification code was emailed and must be confirmed first. */
  confirmed: boolean;
}

let cognito: CognitoIdentityProviderClient | null = null;
function client(): CognitoIdentityProviderClient {
  cognito ??= new CognitoIdentityProviderClient({ region: config.region });
  return cognito;
}

function secretHash(username: string): string | undefined {
  if (!config.cognito.clientSecret) return undefined;
  return createHmac("sha256", config.cognito.clientSecret)
    .update(username + config.cognito.clientId)
    .digest("base64");
}

/* ---------------- local password hashing (dev mode) ---------------- */

export { generateCode, hashPassword, verifyPassword } from "./password";

/* ---------------- Cognito operations ---------------- */

export async function providerSignUp(email: string, password: string): Promise<SignUpResult> {
  if (config.devAuth) {
    return { sub: `dev_${randomBytes(12).toString("hex")}`, confirmed: false };
  }
  try {
    const res = await client().send(
      new SignUpCommand({
        ClientId: config.cognito.clientId,
        Username: email,
        Password: password,
        SecretHash: secretHash(email),
        UserAttributes: [{ Name: "email", Value: email }],
      }),
    );
    return { sub: res.UserSub!, confirmed: Boolean(res.UserConfirmed) };
  } catch (err) {
    throw translate(err);
  }
}

export async function providerConfirmSignUp(email: string, code: string): Promise<void> {
  if (config.devAuth) return;
  try {
    await client().send(
      new ConfirmSignUpCommand({
        ClientId: config.cognito.clientId,
        Username: email,
        ConfirmationCode: code,
        SecretHash: secretHash(email),
      }),
    );
  } catch (err) {
    throw translate(err);
  }
}

export async function providerResendCode(email: string): Promise<void> {
  if (config.devAuth) return;
  try {
    await client().send(
      new ResendConfirmationCodeCommand({
        ClientId: config.cognito.clientId,
        Username: email,
        SecretHash: secretHash(email),
      }),
    );
  } catch (err) {
    throw translate(err);
  }
}

/** Returns the Cognito sub on success. */
export async function providerSignIn(email: string, password: string): Promise<string> {
  if (config.devAuth) {
    throw new Error("providerSignIn must not be called in dev-auth mode");
  }
  try {
    const res = await client().send(
      new InitiateAuthCommand({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: config.cognito.clientId,
        AuthParameters: {
          USERNAME: email,
          PASSWORD: password,
          ...(secretHash(email) ? { SECRET_HASH: secretHash(email)! } : {}),
        },
      }),
    );
    if (!res.AuthenticationResult?.AccessToken) {
      throw new ApiError("UNAUTHENTICATED", "Incorrect email or password.");
    }
    const user = await client().send(
      new AdminGetUserCommand({
        UserPoolId: config.cognito.userPoolId,
        Username: email,
      }),
    );
    const sub = user.UserAttributes?.find((a) => a.Name === "sub")?.Value;
    if (!sub) throw new ApiError("SERVER_ERROR", "Could not resolve the account.");
    return sub;
  } catch (err) {
    throw translate(err);
  }
}

export async function providerForgotPassword(email: string): Promise<void> {
  if (config.devAuth) return;
  try {
    await client().send(
      new ForgotPasswordCommand({
        ClientId: config.cognito.clientId,
        Username: email,
        SecretHash: secretHash(email),
      }),
    );
  } catch (err) {
    // Don't reveal whether the account exists (user enumeration).
    if (isCode(err, "UserNotFoundException")) return;
    throw translate(err);
  }
}

export async function providerResetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  if (config.devAuth) return;
  try {
    await client().send(
      new ConfirmForgotPasswordCommand({
        ClientId: config.cognito.clientId,
        Username: email,
        ConfirmationCode: code,
        Password: newPassword,
        SecretHash: secretHash(email),
      }),
    );
  } catch (err) {
    throw translate(err);
  }
}

/* ---------------- Google / Hosted UI ---------------- */

export function googleLoginUrl(state: string): string {
  if (!config.cognito.domain || !config.cognito.clientId) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Google sign-in is not configured on this environment.",
    );
  }
  const redirectUri = `${config.appUrl}/api/v1/auth/callback`;
  const params = new URLSearchParams({
    client_id: config.cognito.clientId,
    response_type: "code",
    scope: "openid email profile",
    redirect_uri: redirectUri,
    identity_provider: "Google",
    state,
  });
  return `https://${config.cognito.domain}/oauth2/authorize?${params}`;
}

export interface OAuthIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Exchanges the Hosted UI authorization code for the user's identity. */
export async function exchangeOAuthCode(code: string): Promise<OAuthIdentity> {
  const redirectUri = `${config.appUrl}/api/v1/auth/callback`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.cognito.clientId,
    code,
    redirect_uri: redirectUri,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (config.cognito.clientSecret) {
    const basic = Buffer.from(
      `${config.cognito.clientId}:${config.cognito.clientSecret}`,
    ).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  }

  const res = await fetch(`https://${config.cognito.domain}/oauth2/token`, {
    method: "POST",
    headers,
    body,
  });
  if (!res.ok) {
    throw new ApiError("UNAUTHENTICATED", "Google sign-in failed. Please try again.");
  }
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) {
    throw new ApiError("UNAUTHENTICATED", "Google sign-in returned no identity token.");
  }
  return decodeIdToken(tokens.id_token);
}

/**
 * Reads the claims from a Cognito-issued ID token. The token came straight from
 * Cognito's token endpoint over TLS in the call above, so this is a decode, not
 * a trust boundary - never call it with a token from the client.
 */
function decodeIdToken(idToken: string): OAuthIdentity {
  const payloadPart = idToken.split(".")[1];
  if (!payloadPart) throw new ApiError("UNAUTHENTICATED", "Malformed identity token.");
  const claims = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
    sub: string;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
  };
  if (!claims.sub || !claims.email) {
    throw new ApiError("UNAUTHENTICATED", "Google did not return an email address.");
  }
  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: claims.name,
  };
}

/* ---------------- error translation ---------------- */

function isCode(err: unknown, name: string): boolean {
  return typeof err === "object" && err !== null && (err as { name?: string }).name === name;
}

function translate(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (isCode(err, "UsernameExistsException")) {
    return new ApiError("CONFLICT", "An account with that email already exists.");
  }
  if (isCode(err, "NotAuthorizedException")) {
    return new ApiError("UNAUTHENTICATED", "Incorrect email or password.");
  }
  if (isCode(err, "UserNotConfirmedException")) {
    return new ApiError("FORBIDDEN", "Verify your email address before signing in.");
  }
  if (isCode(err, "CodeMismatchException") || isCode(err, "ExpiredCodeException")) {
    return new ApiError("BAD_REQUEST", "That code is incorrect or has expired.");
  }
  if (isCode(err, "InvalidPasswordException")) {
    return new ApiError("VALIDATION_FAILED", "That password does not meet the requirements.");
  }
  if (isCode(err, "LimitExceededException") || isCode(err, "TooManyRequestsException")) {
    return new ApiError("RATE_LIMITED", "Too many attempts. Please wait and try again.");
  }
  if (isCode(err, "UserNotFoundException")) {
    return new ApiError("UNAUTHENTICATED", "Incorrect email or password.");
  }
  console.error("[auth] provider error", err);
  return new ApiError("SERVER_ERROR", "Authentication is unavailable. Please try again.");
}
