import { describe, it, expect } from "vitest";
import { buildUserMessage } from "../onboarding";

describe("buildUserMessage", () => {
  it("includes provided fields in order", () => {
    const msg = buildUserMessage({
      sex: "F",
      age: 32,
      weight_kg: 60,
      notes: "vegetarian; low LDL goal",
    });
    expect(msg).toMatch(/Sex: Female/);
    expect(msg).toMatch(/Age: 32/);
    expect(msg).toMatch(/Weight: 60 kg/);
    expect(msg).toMatch(/Notes: vegetarian; low LDL goal/);
  });

  it("falls back to a sensible note when no fields are provided", () => {
    const msg = buildUserMessage({});
    expect(msg.toLowerCase()).toContain("no personal info");
  });

  it("omits missing fields gracefully", () => {
    const msg = buildUserMessage({ sex: "M", weight_kg: 78 });
    expect(msg).toMatch(/Sex: Male/);
    expect(msg).toMatch(/Weight: 78 kg/);
    expect(msg).not.toMatch(/Age:/);
    expect(msg).not.toMatch(/Notes:/);
  });

  it("renders X sex as 'Prefer not to say'", () => {
    const msg = buildUserMessage({ sex: "X" });
    expect(msg).toMatch(/Sex: Prefer not to say/);
  });

  it("trims whitespace-only notes to absence", () => {
    const msg = buildUserMessage({ sex: "F", notes: "   " });
    expect(msg).not.toMatch(/Notes:/);
  });
});
