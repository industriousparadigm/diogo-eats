import { describe, it, expect } from "vitest";
import { isAllowedEmail, parseAllowedEmails, parseBearerToken } from "../auth";

describe("parseAllowedEmails", () => {
  it("splits comma-separated list and lowercases each entry", () => {
    expect(parseAllowedEmails("A@x.com, B@Y.com")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
  it("trims whitespace", () => {
    expect(parseAllowedEmails("  a@x.com  , b@y.com  ")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
  });
  it("returns empty list for null / undefined / empty", () => {
    expect(parseAllowedEmails(null)).toEqual([]);
    expect(parseAllowedEmails(undefined)).toEqual([]);
    expect(parseAllowedEmails("")).toEqual([]);
  });
  it("ignores empty entries from a trailing comma", () => {
    expect(parseAllowedEmails("a@x.com,")).toEqual(["a@x.com"]);
  });
});

describe("isAllowedEmail", () => {
  const allowed = ["diogo@okrasolar.com", "mariana@example.com"];

  it("matches case-insensitively", () => {
    expect(isAllowedEmail("Diogo@OkraSolar.COM", allowed)).toBe(true);
  });
  it("rejects non-allowlisted email", () => {
    expect(isAllowedEmail("stranger@example.com", allowed)).toBe(false);
  });
  it("rejects undefined / null / empty email", () => {
    expect(isAllowedEmail(undefined, allowed)).toBe(false);
    expect(isAllowedEmail(null, allowed)).toBe(false);
    expect(isAllowedEmail("", allowed)).toBe(false);
  });
  it("rejects when allowlist is empty (no one's invited)", () => {
    expect(isAllowedEmail("diogo@okrasolar.com", [])).toBe(false);
  });
});

describe("parseBearerToken", () => {
  it("extracts the token from a well-formed header", () => {
    expect(parseBearerToken("Bearer abc.def.ghi")).toBe("abc.def.ghi");
  });
  it("is case-insensitive on the scheme and tolerates trailing space", () => {
    expect(parseBearerToken("bearer tok123 ")).toBe("tok123");
    expect(parseBearerToken("BEARER tok123")).toBe("tok123");
  });
  it("rejects missing/malformed headers", () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
    expect(parseBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseBearerToken("Bearer two tokens")).toBeNull();
  });
});
