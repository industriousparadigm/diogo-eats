// Strava / fitness-screenshot parser for the Movement tab. Reads ONE
// workout screenshot (Strava, Apple Fitness, Garmin, Nike Run Club, a
// treadmill display, …) and extracts the run's stats so the user fills a
// general-activity log without retyping. Mirrors lib/vision.ts's structured-
// output call shape; normalizeParsedActivity is pure (no I/O) and exported
// for unit tests — it coerces anything dubious to null rather than throwing.

import Anthropic from "@anthropic-ai/sdk";
import { ACTIVITY_TYPES, SURFACES, MAX_ELEVATION_M } from "./activities";

const client = new Anthropic();

// What the model returns before normalisation. Every field nullable; the
// schema makes them all required (typed as `["string","null"]` etc.) so the
// model can't omit one and leave us guessing whether it meant null.
export type RawParsedActivity = {
  type: string | null;
  distance_km: number | null;
  duration_min: number | null;
  surface: string | null;
  elevation_m: number | null;
  started_at_iso: string | null;
  avg_pace_per_km: string | null;
  confidence: string | null;
  summary: string | null;
};

// The cleaned shape the route returns to the client. started_at is ms epoch
// (or null), the rest mirror the Activity column types.
export type ParsedActivity = {
  type: string;
  distance_km: number | null;
  duration_min: number | null;
  surface: string | null;
  elevation_m: number | null;
  started_at: number | null;
  avg_pace_per_km: string | null;
  confidence: string;
  summary: string;
};

export const ACTIVITY_PARSE_SYSTEM = `You read ONE screenshot from a fitness app (Strava, Apple Fitness, Garmin, Nike Run Club, a treadmill display, etc.) and extract the workout's stats for a personal movement log. Return ONLY what you can actually read or confidently infer from the image. Anything not present is null — NEVER invent a number to look complete; the user fills gaps by hand.

Fields:
- type: closest of [run, walk, bike, swim, padel, football, hike, other]. 'Ride'/'Cycling'→bike; 'Walk'→walk; 'Hike'→hike; pool/open-water→swim. Unclear → other.
- distance_km: total distance in km. Convert miles→km (×1.60934). null if not shown.
- duration_min: whole minutes. Prefer MOVING time over elapsed when both are shown (it's the real effort). Convert h:mm:ss → minutes, round. null if not shown.
- surface: one of [road, trail, track, treadmill, gravel, indoor, mixed] when you can tell (a 'Trail Run' label, a trail map, a treadmill readout, an indoor ride). null otherwise.
- elevation_m: elevation GAIN in meters. Convert feet→m (×0.3048). null if not shown.
- started_at_iso: ISO 8601 start datetime ONLY if clearly shown (a date, 'Today at 7:14 AM'). null otherwise — never guess the time.
- avg_pace_per_km: average pace 'M:SS' per km if the app states it (convert per-mile→per-km). null otherwise.
- confidence: 'high' if the core stats are clearly legible, 'medium' if partial, 'low' if mostly guessing or it isn't a workout screenshot.
- summary: one short factual line of what you read (e.g. '8.2 km trail run, 47 min, 312 m gain'). No coaching, no encouragement.

Detect metric vs imperial and convert to km / meters. If a bare number has no unit, infer from context (a 'run' of 5.2 with ~5:00 pace is km). If the image isn't a workout at all: type 'other', everything else null, confidence 'low', summary saying so.`;

// json_schema for the model output. All fields required; nullable ones typed
// as a string/number-or-null union so the model always emits the key. type and
// confidence are constrained enums; additionalProperties:false locks the shape.
export const ACTIVITY_PARSE_SCHEMA = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["run", "walk", "bike", "swim", "padel", "football", "hike", "other"],
    },
    distance_km: { type: ["number", "null"] },
    duration_min: { type: ["number", "null"] },
    surface: { type: ["string", "null"] },
    elevation_m: { type: ["number", "null"] },
    started_at_iso: { type: ["string", "null"] },
    avg_pace_per_km: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
  },
  required: [
    "type",
    "distance_km",
    "duration_min",
    "surface",
    "elevation_m",
    "started_at_iso",
    "avg_pace_per_km",
    "confidence",
    "summary",
  ],
  additionalProperties: false,
} as const;

export async function parseActivityPhoto(
  imageBase64: string,
  mediaType: string
): Promise<RawParsedActivity> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    output_config: {
      format: { type: "json_schema", schema: ACTIVITY_PARSE_SCHEMA },
    },
    system: ACTIVITY_PARSE_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg" | "image/png" | "image/webp",
              data: imageBase64,
            },
          },
          { type: "text", text: "Read this workout screenshot and extract its stats." },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  return JSON.parse(textBlock.text) as RawParsedActivity;
}

// --- pure normalisation (exported for tests) ---

const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;
const CONFIDENCES = ["low", "medium", "high"] as const;

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

// Coerce the model's raw output into the columns we store. Never throws —
// anything malformed becomes null (the user fills it in by hand). `now` is
// injectable so the future/past window is unit-testable against a fixed clock.
export function normalizeParsedActivity(
  raw: unknown,
  now: number = Date.now()
): ParsedActivity {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  // type: clamp to the activity whitelist; anything unknown → 'other'.
  const type =
    typeof r.type === "string" && (ACTIVITY_TYPES as readonly string[]).includes(r.type)
      ? r.type
      : "other";

  // distance_km: a positive finite number, else null.
  const distance_km =
    isFiniteNumber(r.distance_km) && r.distance_km > 0 ? r.distance_km : null;

  // duration_min: a positive integer (round a fractional value), else null.
  let duration_min: number | null = null;
  if (isFiniteNumber(r.duration_min) && r.duration_min > 0) {
    const rounded = Math.round(r.duration_min);
    duration_min = rounded > 0 ? rounded : null;
  }

  // surface: must be in the whitelist, else null.
  const surface =
    typeof r.surface === "string" && (SURFACES as readonly string[]).includes(r.surface)
      ? r.surface
      : null;

  // elevation_m: an integer in [0, MAX_ELEVATION_M]. Round a fractional value
  // (feet→m conversions rarely land on a whole metre), then bounds-check.
  let elevation_m: number | null = null;
  if (isFiniteNumber(r.elevation_m)) {
    const rounded = Math.round(r.elevation_m);
    if (rounded >= 0 && rounded <= MAX_ELEVATION_M) elevation_m = rounded;
  }

  // started_at: parse the ISO string to ms ONLY if valid, not in the future,
  // and not older than a year. Otherwise null — we never guess the time.
  let started_at: number | null = null;
  if (typeof r.started_at_iso === "string") {
    const ts = Date.parse(r.started_at_iso);
    if (Number.isFinite(ts) && ts <= now && ts >= now - ONE_YEAR_MS) {
      started_at = ts;
    }
  }

  // avg_pace_per_km: a short non-empty string, else null.
  const avg_pace_per_km =
    typeof r.avg_pace_per_km === "string" && r.avg_pace_per_km.trim().length > 0
      ? r.avg_pace_per_km.trim().slice(0, 32)
      : null;

  // confidence: one of the three levels, defaulting to 'low'.
  const confidence =
    typeof r.confidence === "string" &&
    (CONFIDENCES as readonly string[]).includes(r.confidence)
      ? r.confidence
      : "low";

  // summary: a string, defaulting to ''.
  const summary = typeof r.summary === "string" ? r.summary : "";

  return {
    type,
    distance_km,
    duration_min,
    surface,
    elevation_m,
    started_at,
    avg_pace_per_km,
    confidence,
    summary,
  };
}
