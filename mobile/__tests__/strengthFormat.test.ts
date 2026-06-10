// Unit tests for lib/strengthFormat.ts — one vocabulary for strength
// numbers across overview, picker, and entry screens.

import {
  fmtKg,
  fmtSeries,
  fmtSeriesList,
  fmtBest,
  fmtSessionDate,
  repsUnit,
  weightUnit,
} from "../lib/strengthFormat";

describe("fmtKg", () => {
  it("trims trailing zeros", () => {
    expect(fmtKg(32)).toBe("32kg");
    expect(fmtKg(32.5)).toBe("32.5kg");
    expect(fmtKg(32.0)).toBe("32kg");
  });
});

describe("fmtSeries", () => {
  it("formats weight_reps", () => {
    expect(fmtSeries({ weight_kg: 39, reps: 12 }, "weight_reps")).toBe("39kg × 12");
  });

  it("formats bodyweight_reps without weight", () => {
    expect(fmtSeries({ weight_kg: null, reps: 12 }, "bodyweight_reps")).toBe("12 reps");
  });

  it("formats carry with steps", () => {
    expect(fmtSeries({ weight_kg: 16, reps: 60 }, "carry")).toBe("16kg × 60 steps");
  });

  it("handles a missing weight on a weighted type", () => {
    expect(fmtSeries({ weight_kg: null, reps: 10 }, "weight_reps")).toBe("× 10");
  });
});

describe("fmtSeriesList", () => {
  it("joins distinct series", () => {
    expect(
      fmtSeriesList(
        [
          { weight_kg: 32, reps: 12 },
          { weight_kg: 39, reps: 12 },
        ],
        "weight_reps"
      )
    ).toBe("32kg × 12  ·  39kg × 12");
  });

  it("collapses identical series", () => {
    expect(
      fmtSeriesList(
        [
          { weight_kg: 32, reps: 12 },
          { weight_kg: 32, reps: 12 },
        ],
        "weight_reps"
      )
    ).toBe("2 × (32kg × 12)");
  });

  it("returns empty string for no series", () => {
    expect(fmtSeriesList([], "weight_reps")).toBe("");
  });

  it("keeps a single series as-is", () => {
    expect(fmtSeriesList([{ weight_kg: 16, reps: 60 }], "carry")).toBe(
      "16kg × 60 steps"
    );
  });
});

describe("fmtBest", () => {
  it("formats heaviest-ever for weight types", () => {
    expect(fmtBest({ kind: "weight", weight_kg: 39, reps: 12 }, "weight_reps")).toBe(
      "39kg × 12"
    );
  });

  it("formats carry best with steps", () => {
    expect(fmtBest({ kind: "weight", weight_kg: 16, reps: 60 }, "carry")).toBe(
      "16kg × 60 steps"
    );
  });

  it("formats bodyweight best as total reps", () => {
    expect(fmtBest({ kind: "total_reps", reps: 24 }, "bodyweight_reps")).toBe(
      "24 reps total"
    );
  });
});

describe("fmtSessionDate", () => {
  it("formats as weekday day month", () => {
    const ms = new Date(2026, 5, 10, 18, 0).getTime();
    expect(fmtSessionDate(ms)).toBe("Wed 10 Jun");
  });
});

describe("units", () => {
  it("uses steps for carries, reps otherwise", () => {
    expect(repsUnit("carry")).toBe("steps");
    expect(repsUnit("weight_reps")).toBe("reps");
    expect(repsUnit("bodyweight_reps")).toBe("reps");
  });

  it("labels carry weight per hand", () => {
    expect(weightUnit("carry")).toBe("kg / hand");
    expect(weightUnit("weight_reps")).toBe("kg");
  });
});
