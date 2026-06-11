// The "machine taken" brain. Given an exercise the user can't do right now
// (the machine's in use), rank the BEST substitutes from the existing
// catalog, and — only when the catalog overlap is weak — suggest 0-2 new
// exercises the user could add. One Claude call, structured output via the
// same json_schema pattern as lib/vision.ts.
//
// Pure except for the single model call: the prompt builder is exported so
// its invariants (catalog present, today's logged exercises excluded, the
// blocked exercise's own details given) are unit-tested without hitting the
// network — same discipline as the vision prompt-invariant tests.

import Anthropic from "@anthropic-ai/sdk";
import type { Exercise, MeasurementType } from "./types";
import { MEASUREMENT_TYPES } from "./exercises";

// Own client instance, mirroring lib/vision.ts (which does `new Anthropic()`
// at module load). Instantiated at import time, so this module is
// server-only — never import it into client/browser code.
const client = new Anthropic();

// claude-sonnet-4-6: cheap and sufficient for gym-substitution ranking —
// the owner specced this model. Adaptive thinking, structured output.
const MODEL = "claude-sonnet-4-6";

export type CatalogAlternative = { exercise_id: string; reason: string };
export type NewSuggestion = {
  name: string;
  measurement_type: MeasurementType;
  description: string;
  reason: string;
};
export type AlternativesResult = {
  alternatives: CatalogAlternative[];
  suggestions: NewSuggestion[];
};

const ALTERNATIVES_SCHEMA = {
  type: "object",
  properties: {
    alternatives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          exercise_id: { type: "string" },
          reason: { type: "string" },
        },
        required: ["exercise_id", "reason"],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          measurement_type: { type: "string", enum: MEASUREMENT_TYPES },
          description: { type: "string" },
          reason: { type: "string" },
        },
        required: ["name", "measurement_type", "description", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["alternatives", "suggestions"],
  additionalProperties: false,
};

// Exported for tests: the substitution rules are load-bearing and must not
// silently regress.
export const ALTERNATIVES_SYSTEM = `You are a gym-substitution expert. The user is mid-workout and the machine/equipment for one exercise is taken. Your job: rank the best substitutes from the exercises they ALREADY have, and only when those are weak, suggest a small number of new ones.

You are given:
- The blocked exercise: its name, measurement type, and a form-cue description.
- The full catalog of exercises the user has available (id, name, type, description).
- The ids of exercises the user has ALREADY logged today (these are off the table — they've trained that movement already this session).

Rank candidates by how well they hit the SAME movement pattern and primary muscles as the blocked exercise. A good substitute trains the same job (a row substitutes a row; a press substitutes a press; a hinge substitutes a hinge). Matching the measurement type is a nice-to-have, not the goal — the movement and muscles matter more.

Rules:
- **alternatives**: pick from the catalog ONLY. Exclude the blocked exercise itself and every exercise already logged today. Order best-first. Each needs a short, honest one-line reason a lifter would buy ("hits the same lats and mid-back as the row, just chest-supported").
- **Be honest about overlap.** One genuinely good substitute beats three mediocre ones. If only one catalog exercise truly fits, return just that one. If NONE of the remaining catalog exercises hit the same pattern, return an empty alternatives list rather than padding with bad picks. Never recommend something that trains a different muscle group just to fill the list.
- **suggestions**: 0-2 NEW exercises, and ONLY when the catalog overlap is weak (no strong sub, or none at all). When the catalog already has a great substitute, return an empty suggestions list — don't suggest new exercises the user would have to add for no reason. Each suggestion is a realistic, common gym machine/free-weight movement (use the name a gym would print on the machine), with the correct measurement_type and a short form-cue description written in the same plain, direct voice as the catalog descriptions (what to set up, the movement, one thing not to do). Each needs a reason explaining why it substitutes the blocked exercise.

measurement_type values:
- weight_reps — a weight is moved for reps (machines, barbells, dumbbells pressed/pulled/pushed).
- bodyweight_reps — bodyweight movement counted in reps (back extension, push-up, pull-up).
- carry — loaded carry: weight held, distance/steps counted (farmer's carry).`;

// Exported for tests. Builds the user-turn text: the blocked exercise, the
// full available catalog, and the ids already logged today. todayLoggedIds
// is informational context for the model; the route also defends by
// dropping logged ids from the returned alternatives.
export function buildAlternativesPrompt(
  blocked: Exercise,
  catalog: Exercise[],
  todayLoggedIds: string[]
): string {
  const catalogLines = catalog
    .map(
      (e) =>
        `- id="${e.id}" | "${e.name}" | ${e.measurement_type} | ${e.description}`
    )
    .join("\n");
  const loggedLine =
    todayLoggedIds.length > 0
      ? todayLoggedIds.map((id) => `"${id}"`).join(", ")
      : "(none yet)";

  return `BLOCKED EXERCISE (the machine is taken):
- "${blocked.name}" | ${blocked.measurement_type} | ${blocked.description}

AVAILABLE CATALOG (rank substitutes from these ids; exclude the blocked one and anything logged today):
${catalogLines}

ALREADY LOGGED TODAY (exclude these from alternatives): ${loggedLine}

Rank the best catalog substitutes for the blocked exercise, and suggest new exercises only if the catalog overlap is weak.`;
}

// One model call → ranked catalog substitutes + optional new suggestions.
// Pure inputs (the blocked exercise, the catalog, today's logged ids); the
// only side effect is the Anthropic request. The route handles auth, the
// 404 for an unknown exercise, and the 502 when this throws. As a
// belt-and-suspenders defense the returned alternatives are filtered to
// real catalog ids that aren't the blocked exercise or already logged
// today — so a model slip can't surface an id the client can't use.
export async function getAlternatives(
  blocked: Exercise,
  catalog: Exercise[],
  todayLoggedIds: string[]
): Promise<AlternativesResult> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    output_config: {
      format: { type: "json_schema", schema: ALTERNATIVES_SCHEMA },
    },
    system: ALTERNATIVES_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: buildAlternativesPrompt(blocked, catalog, todayLoggedIds),
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  const parsed = JSON.parse(textBlock.text) as AlternativesResult;

  const excluded = new Set([blocked.id, ...todayLoggedIds]);
  const catalogIds = new Set(catalog.map((e) => e.id));
  const alternatives = (parsed.alternatives ?? []).filter(
    (a) => catalogIds.has(a.exercise_id) && !excluded.has(a.exercise_id)
  );
  const suggestions = (parsed.suggestions ?? []).slice(0, 2);

  return { alternatives, suggestions };
}
