import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@learn-ai/db", () => ({
  getPool: () => ({ query: queryMock }),
  newId: () => "test-generated-id",
}));

const getTokenMock = vi.fn();
vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => getTokenMock(...args),
}));

vi.mock("./mailer", () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

// Imported after the mocks above so `provider.ts` picks up the mocked
// modules rather than the real `@learn-ai/db` pool / `next-auth/jwt`.
const { authProvider } = await import("./provider");

function fakeRequest(): NextRequest {
  // getSession/requireUser/requireRole only ever pass `req` through to the
  // mocked `getToken`, which ignores its shape — a fake session, as the
  // T03 brief calls for.
  return {} as NextRequest;
}

function userRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user-1",
    email: "member@example.com",
    email_verified_at: "2026-01-01T00:00:00Z",
    role: "member",
    deleted_at: null,
    ...overrides,
  };
}

describe("AuthProvider guard behaviour (§2.2)", () => {
  beforeEach(() => {
    queryMock.mockReset();
    getTokenMock.mockReset();
    process.env.AUTH_SECRET = "unit-test-secret";
  });

  it("getSession returns null when there is no session token", async () => {
    getTokenMock.mockResolvedValue(null);
    await expect(authProvider.getSession(fakeRequest())).resolves.toBeNull();
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("getSession returns null for a token whose user no longer exists", async () => {
    getTokenMock.mockResolvedValue({ sub: "ghost" });
    queryMock.mockResolvedValueOnce({ rows: [] });
    await expect(authProvider.getSession(fakeRequest())).resolves.toBeNull();
  });

  it("getSession returns null for a soft-deleted user", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1" });
    queryMock.mockResolvedValueOnce({ rows: [userRow({ deleted_at: "2026-01-01T00:00:00Z" })] });
    await expect(authProvider.getSession(fakeRequest())).resolves.toBeNull();
  });

  it("getSession fails closed (500 AUTH_MISCONFIGURED) when AUTH_SECRET is unset", async () => {
    delete process.env.AUTH_SECRET;
    await expect(authProvider.getSession(fakeRequest())).rejects.toMatchObject({
      status: 500,
      code: "AUTH_MISCONFIGURED",
    });
  });

  it("requireUser throws 401 UNAUTHENTICATED when there is no session", async () => {
    getTokenMock.mockResolvedValue(null);
    await expect(authProvider.requireUser(fakeRequest())).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  it("requireUser throws 401 EMAIL_NOT_VERIFIED for an unverified user (member routes stay closed)", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1" });
    queryMock.mockResolvedValueOnce({ rows: [userRow({ email_verified_at: null })] });
    await expect(authProvider.requireUser(fakeRequest())).rejects.toMatchObject({
      status: 401,
      code: "EMAIL_NOT_VERIFIED",
    });
  });

  it("requireUser resolves an AuthenticatedUser for a verified session", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1" });
    queryMock.mockResolvedValueOnce({ rows: [userRow()] });
    await expect(authProvider.requireUser(fakeRequest())).resolves.toEqual({
      id: "user-1",
      email: "member@example.com",
      emailVerified: true,
      role: "member",
    });
  });

  it("requireRole throws 403 FORBIDDEN when a member hits a reviewer-only route", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1" });
    queryMock.mockResolvedValueOnce({ rows: [userRow({ role: "member" })] });
    await expect(authProvider.requireRole(fakeRequest(), "reviewer")).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
  });

  it("requireRole throws 401 (not 403) for an unauthenticated caller hitting a reviewer route", async () => {
    getTokenMock.mockResolvedValue(null);
    await expect(authProvider.requireRole(fakeRequest(), "reviewer")).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });

  it("requireRole allows a higher-ranked role to satisfy a lower requirement (admin -> reviewer route)", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1" });
    queryMock.mockResolvedValueOnce({ rows: [userRow({ role: "admin" })] });
    await expect(authProvider.requireRole(fakeRequest(), "reviewer")).resolves.toMatchObject({
      role: "admin",
    });
  });

  it("requireRole resolves for an exact role match", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1" });
    queryMock.mockResolvedValueOnce({ rows: [userRow({ role: "reviewer" })] });
    await expect(authProvider.requireRole(fakeRequest(), "reviewer")).resolves.toMatchObject({
      role: "reviewer",
    });
  });
});

describe("AuthProvider.signUp validation (§2.2)", () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it("rejects an invalid email before touching the database", async () => {
    await expect(authProvider.signUp("not-an-email")).rejects.toMatchObject({
      status: 422,
      code: "INVALID_EMAIL",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects a password shorter than 8 characters before touching the database", async () => {
    await expect(authProvider.signUp("a@b.com", "short")).rejects.toMatchObject({
      status: 422,
      code: "WEAK_PASSWORD",
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("rejects a duplicate email", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: "existing" }], rowCount: 1 });
    await expect(
      authProvider.signUp("dup@example.com", "longenoughpassword"),
    ).rejects.toMatchObject({ status: 422, code: "EMAIL_ALREADY_REGISTERED" });
  });
});
