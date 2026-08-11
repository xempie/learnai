import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { rateLimit } from "./rate-limit";

function reqFromIp(ip: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/v1/auth/signup", {
    headers: { "x-forwarded-for": ip },
  });
}

describe("rateLimit", () => {
  it("allows requests under the limit", () => {
    const ip = `1.2.3.${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      expect(() => rateLimit(reqFromIp(ip), "test:under", 3, 60_000)).not.toThrow();
    }
  });

  it("throws a 429 ApiError once the limit is exceeded within the window", () => {
    const ip = `5.6.7.${Math.random()}`;
    for (let i = 0; i < 2; i += 1) {
      rateLimit(reqFromIp(ip), "test:over", 2, 60_000);
    }
    let caught: unknown;
    try {
      rateLimit(reqFromIp(ip), "test:over", 2, 60_000);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ status: 429, code: "RATE_LIMITED" });
  });

  it("tracks distinct IPs independently", () => {
    const key = `test:distinct:${Math.random()}`;
    expect(() => rateLimit(reqFromIp("9.9.9.1"), key, 1, 60_000)).not.toThrow();
    expect(() => rateLimit(reqFromIp("9.9.9.2"), key, 1, 60_000)).not.toThrow();
  });
});
