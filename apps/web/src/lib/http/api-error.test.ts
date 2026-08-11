import { describe, expect, it } from "vitest";
import { ApiError, errorResponse } from "./api-error";

describe("errorResponse", () => {
  it("renders an ApiError into the §8 error envelope with its own status", async () => {
    const res = errorResponse(
      new ApiError(422, "INVALID_EMAIL", "Enter a valid email address.", {
        field: "email",
      }),
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body).toEqual({
      error: {
        code: "INVALID_EMAIL",
        message: "Enter a valid email address.",
        details: { field: "email" },
      },
    });
  });

  it("maps a raw DB connection failure to a clean 503, not a crash", async () => {
    const res = errorResponse(Object.assign(new Error("connect failed"), { code: "ECONNREFUSED" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("maps a missing DATABASE_URL error to 503", async () => {
    const res = errorResponse(
      new Error("DATABASE_URL is not set. Copy .env.example to .env.local."),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("falls back to a generic 500 for anything else", async () => {
    const res = errorResponse(new Error("boom"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
