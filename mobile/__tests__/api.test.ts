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

import {
  ApiError,
  ExerciseConflictError,
  attachMealPhoto,
  createStrengthExercise,
  fetchAlternatives,
  removeMealPhoto,
} from "../lib/api";
import type { Exercise } from "../lib/strengthTypes";
import type { Meal } from "../lib/types";

const EXISTING: Exercise = {
  id: "tricep-pulley",
  name: "Tricep pulley",
  description: "push down",
  measurement_type: "weight_reps",
  image_key: null,
  created_by: "u1",
  sort_order: 7,
};

// A minimal Response stand-in for the global fetch mock.
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
    url: "",
  } as unknown as Response;
}

describe("createStrengthExercise", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns the created exercise on 200", async () => {
    const created = { ...EXISTING, id: "tricep-pulley", created_by: "u1" };
    globalThis.fetch = jest.fn(async () => jsonResponse(200, { exercise: created })) as unknown as typeof fetch;
    const ex = await createStrengthExercise({
      name: "Tricep pulley",
      measurement_type: "weight_reps",
    });
    expect(ex.id).toBe("tricep-pulley");
  });

  it("throws ExerciseConflictError carrying the echoed exercise on 409", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(409, { error: "exercise already exists", exercise: EXISTING })
    ) as unknown as typeof fetch;
    await expect(
      createStrengthExercise({ name: "Tricep Pulley", measurement_type: "weight_reps" })
    ).rejects.toMatchObject({
      name: "ExerciseConflictError",
      exercise: { id: "tricep-pulley", name: "Tricep pulley" },
    });
    // And it's catchable as the typed error so the UI can offer "use that one".
    try {
      globalThis.fetch = jest.fn(async () =>
        jsonResponse(409, { error: "dupe", exercise: EXISTING })
      ) as unknown as typeof fetch;
      await createStrengthExercise({ name: "x", measurement_type: "weight_reps" });
    } catch (err) {
      expect(err).toBeInstanceOf(ExerciseConflictError);
      expect((err as ExerciseConflictError).exercise.name).toBe("Tricep pulley");
    }
  });

  it("surfaces a 400 validation error as a plain ApiError", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(400, { error: "name required" })
    ) as unknown as typeof fetch;
    await expect(
      createStrengthExercise({ name: "", measurement_type: "weight_reps" })
    ).rejects.toMatchObject({ code: "SERVER_ERROR", message: "name required" });
  });
});

describe("fetchAlternatives", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns the alternatives + suggestions payload", async () => {
    const payload = {
      alternatives: [{ exercise_id: "chest-press", reason: "same push" }],
      suggestions: [],
    };
    globalThis.fetch = jest.fn(async () => jsonResponse(200, payload)) as unknown as typeof fetch;
    const result = await fetchAlternatives("seated-row");
    expect(result.alternatives[0].exercise_id).toBe("chest-press");
    expect(result.suggestions).toEqual([]);
  });

  it("surfaces a 502 as a clean ApiError the sheet can retry from", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(502, { error: "couldn't fetch alternatives" })
    ) as unknown as typeof fetch;
    await expect(fetchAlternatives("seated-row")).rejects.toMatchObject({
      message: "couldn't fetch alternatives",
      status: 502,
    });
  });
});

// A meal stub with just the fields these tests read back.
function mealStub(overrides: Partial<Meal> = {}): Meal {
  return {
    id: "meal-1",
    created_at: Date.now(),
    photo_filename: "abcdef0123456789.jpg",
    items_json: "[]",
    sat_fat_g: 0,
    soluble_fiber_g: 0,
    calories: 0,
    protein_g: 0,
    plant_pct: 0,
    notes: null,
    caption: null,
    meal_vibe: null,
    ...overrides,
  };
}

describe("attachMealPhoto", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("POSTs a multipart body to the meal's photo endpoint and returns the updated meal", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return jsonResponse(200, { meal: mealStub({ photo_filename: "new16hexname0001.jpg" }) });
    }) as unknown as typeof fetch;

    const meal = await attachMealPhoto("meal-1", {
      uri: "file:///tmp/photo.jpg",
      name: "photo.jpg",
      type: "image/jpeg",
    });

    expect(captured.url).toContain("/api/meals/meal-1/photo");
    expect(captured.init?.method).toBe("POST");
    expect(captured.init?.body).toBeInstanceOf(FormData);
    expect(meal.photo_filename).toBe("new16hexname0001.jpg");
  });

  it("surfaces a 400 bad-image error from the route", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(400, { error: "couldn't read that image — try a different format" })
    ) as unknown as typeof fetch;
    await expect(
      attachMealPhoto("meal-1", { uri: "x", name: "x", type: "image/jpeg" })
    ).rejects.toMatchObject({ status: 400 });
  });

  it("surfaces a 403 when the meal isn't the caller's", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(403, { error: "forbidden" })
    ) as unknown as typeof fetch;
    await expect(
      attachMealPhoto("meal-x", { uri: "x", name: "x", type: "image/jpeg" })
    ).rejects.toMatchObject({ status: 403, message: "forbidden" });
  });
});

describe("removeMealPhoto", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("DELETEs the photo endpoint and returns the meal with a nulled filename", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return jsonResponse(200, { meal: mealStub({ photo_filename: null }) });
    }) as unknown as typeof fetch;

    const meal = await removeMealPhoto("meal-1");
    expect(captured.url).toContain("/api/meals/meal-1/photo");
    expect(captured.init?.method).toBe("DELETE");
    expect(meal.photo_filename).toBeNull();
  });
});

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
