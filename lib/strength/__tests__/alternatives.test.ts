import { describe, it, expect } from "vitest";
import {
  ALTERNATIVES_SYSTEM,
  buildAlternativesPrompt,
} from "../alternatives";
import type { Exercise } from "../types";

// ---- fixtures (mirror engine.test.ts) ----

const LEG: Exercise = {
  id: "leg-press",
  name: "Leg press",
  description: "Feet mid-platform, push.",
  measurement_type: "weight_reps",
  image_key: "leg-press",
  created_by: null,
  sort_order: 1,
};
const BACK: Exercise = {
  id: "back-extension",
  name: "Back extension",
  description: "Bow down, lift to a line.",
  measurement_type: "bodyweight_reps",
  image_key: "back-extension",
  created_by: null,
  sort_order: 2,
};
const CHEST: Exercise = {
  id: "chest-press",
  name: "Chest press",
  description: "Push out, return slow.",
  measurement_type: "weight_reps",
  image_key: "chest-press",
  created_by: null,
  sort_order: 3,
};
const ROW: Exercise = {
  id: "seated-row",
  name: "Seated row",
  description: "Pull to belly, squeeze.",
  measurement_type: "weight_reps",
  image_key: "seated-row",
  created_by: null,
  sort_order: 4,
};
const CATALOG = [LEG, BACK, CHEST, ROW];

describe("ALTERNATIVES_SYSTEM (prompt invariants)", () => {
  it("frames the catalog-first, suggest-only-on-weak-overlap rule", () => {
    expect(ALTERNATIVES_SYSTEM).toMatch(/catalog ONLY/i);
    expect(ALTERNATIVES_SYSTEM).toMatch(/already logged today/i);
    expect(ALTERNATIVES_SYSTEM).toMatch(/weak/i);
  });

  it("instructs honesty over padding the list", () => {
    expect(ALTERNATIVES_SYSTEM).toMatch(/empty alternatives list/i);
    expect(ALTERNATIVES_SYSTEM).toMatch(/Never recommend something that trains a different muscle/i);
  });

  it("documents the three measurement types for suggestions", () => {
    expect(ALTERNATIVES_SYSTEM).toContain("weight_reps");
    expect(ALTERNATIVES_SYSTEM).toContain("bodyweight_reps");
    expect(ALTERNATIVES_SYSTEM).toContain("carry");
  });
});

describe("buildAlternativesPrompt", () => {
  it("names the blocked exercise with its type and description", () => {
    const prompt = buildAlternativesPrompt(ROW, CATALOG, []);
    expect(prompt).toContain("Seated row");
    expect(prompt).toContain("weight_reps");
    expect(prompt).toContain("Pull to belly, squeeze.");
    expect(prompt).toMatch(/BLOCKED EXERCISE/i);
  });

  it("includes every catalog exercise id so the model can rank from them", () => {
    const prompt = buildAlternativesPrompt(ROW, CATALOG, []);
    for (const e of CATALOG) {
      expect(prompt).toContain(`id="${e.id}"`);
    }
  });

  it("lists today's logged ids in the exclusion line", () => {
    const prompt = buildAlternativesPrompt(ROW, CATALOG, ["leg-press", "chest-press"]);
    expect(prompt).toMatch(/ALREADY LOGGED TODAY/i);
    expect(prompt).toContain('"leg-press"');
    expect(prompt).toContain('"chest-press"');
  });

  it("renders a (none yet) placeholder when nothing is logged today", () => {
    const prompt = buildAlternativesPrompt(ROW, CATALOG, []);
    expect(prompt).toContain("(none yet)");
  });

  it("works with a user-created exercise as the blocked one", () => {
    const hackSquat: Exercise = {
      id: "hack-squat",
      name: "Hack squat",
      description: "Back on pad, push.",
      measurement_type: "weight_reps",
      image_key: null,
      created_by: "user-123",
      sort_order: 6,
    };
    const prompt = buildAlternativesPrompt(hackSquat, [...CATALOG, hackSquat], []);
    expect(prompt).toContain("Hack squat");
    expect(prompt).toContain('id="hack-squat"');
  });
});
