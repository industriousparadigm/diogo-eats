import { describe, it, expect } from "vitest";
import { refreshTokenRequestBody } from "../whoop";

describe("refreshTokenRequestBody", () => {
  const body = refreshTokenRequestBody("rt-123", "client-id", "client-secret");

  it("uses scope=offline only — the full scope list 400s on Whoop's refresh grant", () => {
    expect(body.get("scope")).toBe("offline");
  });

  it("carries the refresh grant essentials", () => {
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("rt-123");
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_secret")).toBe("client-secret");
  });

  it("sends exactly the five expected params", () => {
    expect([...body.keys()].sort()).toEqual([
      "client_id",
      "client_secret",
      "grant_type",
      "refresh_token",
      "scope",
    ]);
  });
});
