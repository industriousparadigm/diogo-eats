// API client tests for the activities (general MOVEMENT) endpoints —
// GET/POST/PATCH/DELETE shapes, query params, and clean 400 surfacing.

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
  fetchActivities,
  createActivity,
  updateActivity,
  deleteActivity,
} from "../lib/api";
import type { Activity } from "../lib/activityTypes";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
    url: "",
  } as unknown as Response;
}

const PADEL: Activity = {
  id: "act-1",
  type: "padel",
  label: "class",
  started_at: 1781258400000,
  duration_min: 90,
  effort: "light",
  distance_km: null,
  strain: null,
  surface: null,
  elevation_m: null,
  photo_filename: null,
  note: null,
  source: "manual",
  external_id: null,
  created_at: 1781263921532,
  rpe: null,
  feel: null,
  training_effect: null,
};

describe("fetchActivities", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("GETs /api/activities and returns the rows", async () => {
    let captured = "";
    globalThis.fetch = jest.fn(async (url: string) => {
      captured = url;
      return jsonResponse(200, { activities: [PADEL] });
    }) as unknown as typeof fetch;
    const acts = await fetchActivities();
    expect(captured).toContain("/api/activities");
    expect(acts[0].type).toBe("padel");
  });

  it("passes the days query param when given", async () => {
    let captured = "";
    globalThis.fetch = jest.fn(async (url: string) => {
      captured = url;
      return jsonResponse(200, { activities: [] });
    }) as unknown as typeof fetch;
    await fetchActivities(90);
    expect(captured).toContain("days=90");
  });

  it("returns [] when the payload omits activities", async () => {
    globalThis.fetch = jest.fn(async () => jsonResponse(200, {})) as unknown as typeof fetch;
    expect(await fetchActivities()).toEqual([]);
  });
});

describe("createActivity", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("POSTs the input and returns the created activity", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return jsonResponse(200, { activity: PADEL });
    }) as unknown as typeof fetch;

    const act = await createActivity({ type: "padel", duration_min: 90, effort: "light" });
    expect(captured.url).toContain("/api/activities");
    expect(captured.init?.method).toBe("POST");
    expect(JSON.parse(captured.init?.body as string)).toMatchObject({
      type: "padel",
      duration_min: 90,
    });
    expect(act.id).toBe("act-1");
  });

  it("surfaces a 400 validation message verbatim", async () => {
    globalThis.fetch = jest.fn(async () =>
      jsonResponse(400, { error: "duration must be between 1 and 1440" })
    ) as unknown as typeof fetch;
    await expect(createActivity({ type: "padel", duration_min: 0 })).rejects.toMatchObject({
      code: "SERVER_ERROR",
      message: "duration must be between 1 and 1440",
      status: 400,
    });
  });
});

describe("updateActivity", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("PATCHes the id endpoint with the subset and returns the updated row", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return jsonResponse(200, { activity: { ...PADEL, started_at: 1781250000000 } });
    }) as unknown as typeof fetch;

    const act = await updateActivity("act-1", { started_at: 1781250000000 });
    expect(captured.url).toContain("/api/activities/act-1");
    expect(captured.init?.method).toBe("PATCH");
    expect(JSON.parse(captured.init?.body as string)).toEqual({ started_at: 1781250000000 });
    expect(act.started_at).toBe(1781250000000);
  });

  it("sends null to clear a nullable field", async () => {
    let body = "";
    globalThis.fetch = jest.fn(async (_url: string, init: RequestInit) => {
      body = init.body as string;
      return jsonResponse(200, { activity: { ...PADEL, effort: null } });
    }) as unknown as typeof fetch;
    await updateActivity("act-1", { effort: null });
    expect(JSON.parse(body)).toEqual({ effort: null });
  });
});

describe("deleteActivity", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("DELETEs the id endpoint", async () => {
    let captured: { url?: string; init?: RequestInit } = {};
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      captured = { url, init };
      return jsonResponse(200, { ok: true });
    }) as unknown as typeof fetch;
    await deleteActivity("act-1");
    expect(captured.url).toContain("/api/activities/act-1");
    expect(captured.init?.method).toBe("DELETE");
  });
});
