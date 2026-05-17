import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type OnboardingInputs = {
  sex?: "M" | "F" | "X" | null;
  age?: number | null;
  weight_kg?: number | null;
  notes?: string | null; // goals, conditions, dietary preferences
};

export type DerivedTargets = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  rationale: string; // one short sentence
};

const TARGETS_SCHEMA = {
  type: "object",
  properties: {
    sat_fat_g: { type: "number" },
    soluble_fiber_g: { type: "number" },
    calories: { type: "number" },
    protein_g: { type: "number" },
    rationale: { type: "string" },
  },
  required: ["sat_fat_g", "soluble_fiber_g", "calories", "protein_g", "rationale"],
  additionalProperties: false,
};

const SYSTEM = `You set sensible *starter* daily nutrition targets for a personal food-logging app. Inputs: optional sex, age, weight, and free-text notes (goals, conditions, dietary preferences). Output: four target macros + a one-sentence rationale.

Constraints:
- This is a starter — the user can edit later. Pick livable, evidence-aligned numbers, not aspirational ones.
- Calories: rough TDEE estimate. Sedentary baseline; adjust for explicit activity in notes. Round to nearest 50. Never below 1400. Never above 3500 without strong cue.
- Protein: 1.2-1.6g/kg bodyweight when weight is known. Default 80g if weight unknown for adults. Higher if notes mention strength training.
- Soluble fiber: 10g is the LDL-supportive baseline. Raise to 12-15g only if notes mention high LDL / heart-disease-prevention focus.
- Saturated fat: 18g is the livable default. Drop to 13g if notes mention high LDL / cardiovascular goals. Raise to 22g for users with no LDL concern who eat moderate dairy/meat.
- If notes mention diabetes / pre-diabetes → keep calories conservative, protein on the higher side.
- If notes mention pregnancy → calories +300, protein +25g, fiber on the higher side.
- If notes mention "weight loss" goal → modest deficit (200-400 kcal under maintenance), protein on higher side.
- If conflicting signals, lean conservative.

Rationale: ONE sentence (≤30 words) explaining the choice. Plain English, no jargon, no list. Should make the user nod, not need to look anything up.`;

export async function deriveTargets(
  inputs: OnboardingInputs
): Promise<DerivedTargets> {
  const userMsg = buildUserMessage(inputs);

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: TARGETS_SCHEMA },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });

  const block = resp.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") {
    throw new Error("no text response from model");
  }
  return JSON.parse(block.text) as DerivedTargets;
}

// Exported so the prompt body is testable without hitting the API.
export function buildUserMessage(inputs: OnboardingInputs): string {
  const lines: string[] = [];
  if (inputs.sex) lines.push(`Sex: ${humanSex(inputs.sex)}`);
  if (typeof inputs.age === "number") lines.push(`Age: ${inputs.age}`);
  if (typeof inputs.weight_kg === "number")
    lines.push(`Weight: ${inputs.weight_kg} kg`);
  const notes = inputs.notes?.trim();
  if (notes) lines.push(`Notes: ${notes}`);
  if (lines.length === 0)
    lines.push("(No personal info provided — pick conservative adult defaults.)");
  return `Compute starter targets for this user.\n\n${lines.join("\n")}`;
}

function humanSex(s: string): string {
  if (s === "M") return "Male";
  if (s === "F") return "Female";
  return "Prefer not to say";
}
