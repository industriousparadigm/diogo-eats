// Unit tests for lib/api.ts — ApiError class and helper logic.

// Mock the supabase module to avoid initialization with missing Supabase config.
jest.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({
        data: { session: { access_token: "test-token" } },
        error: null,
      })),
      refreshSession: jest.fn(async () => ({ error: null })),
    },
  },
}));

import { ApiError } from "../lib/api";

describe("ApiError", () => {
  it("has the correct name", () => {
    const err = new ApiError("TIMEOUT", "Request timed out");
    expect(err.name).toBe("ApiError");
  });

  it("stores code and message", () => {
    const err = new ApiError("QUOTA_EXCEEDED", "Too many requests", 429);
    expect(err.code).toBe("QUOTA_EXCEEDED");
    expect(err.message).toBe("Too many requests");
    expect(err.status).toBe(429);
  });

  it("is an instance of Error", () => {
    const err = new ApiError("NETWORK_ERROR", "No network");
    expect(err instanceof Error).toBe(true);
    expect(err instanceof ApiError).toBe(true);
  });

  it("accepts undefined status", () => {
    const err = new ApiError("AUTH_ERROR", "Not signed in");
    expect(err.status).toBeUndefined();
  });
});
