import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type ParsedMeal = {
  items: Array<{
    name: string;
    estimated_grams: number;
    confidence: "low" | "medium" | "high";
  }>;
  totals: {
    sat_fat_g: number;
    soluble_fiber_g: number;
    calories: number;
    protein_g: number;
  };
  is_plant_based: boolean;
  notes: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          estimated_grams: { type: "number" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["name", "estimated_grams", "confidence"],
        additionalProperties: false,
      },
    },
    totals: {
      type: "object",
      properties: {
        sat_fat_g: { type: "number" },
        soluble_fiber_g: { type: "number" },
        calories: { type: "number" },
        protein_g: { type: "number" },
      },
      required: ["sat_fat_g", "soluble_fiber_g", "calories", "protein_g"],
      additionalProperties: false,
    },
    is_plant_based: { type: "boolean" },
    notes: { type: "string" },
  },
  required: ["items", "totals", "is_plant_based", "notes"],
  additionalProperties: false,
};

const SYSTEM = `You identify foods in a photo of a single meal and estimate nutrition for a personal food log.

Goal: support a low-saturated-fat, vegan-leaning protocol aimed at lowering LDL cholesterol. Track 4 nutrients per meal: saturated fat (g), soluble fiber (g), calories (kcal), protein (g).

For each item:
- Name the food specifically (e.g. "rolled oats" not "cereal").
- Estimate portion in grams from visual cues (plate size, utensils, depth).
- Flag confidence: high if obvious + standard portion, medium if reasonable estimate, low if guessing.

For totals: sum across items using standard nutrition values. Be honest, not generous. If something is hidden under a sauce, note it.

is_plant_based: true only if every visible item is from plants (no dairy, eggs, meat, fish, honey).

notes: one short sentence — anything the user should know (e.g. "looks oil-heavy", "portion estimate is rough", "could be salmon or trout").`;

export async function parseMealPhoto(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  caption?: string
): Promise<ParsedMeal> {
  const cleanCaption = caption?.trim();
  const userText = cleanCaption
    ? `Identify the items in this meal and estimate nutrition.\n\nUser's note about this meal: "${cleanCaption}"\n\nThe note is from the person who took the photo — usually accurate about what the food is. Use it to disambiguate or refine (e.g. "low-sugar" → reduce calories/sugar; "homemade" → standard portions; "at restaurant" → larger portions; specific ingredient names override visual guesses). If the note clearly contradicts what's visible, trust the photo and call it out in notes.`
    : "Identify the items in this meal and estimate nutrition.";

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          { type: "text", text: userText },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  return JSON.parse(textBlock.text) as ParsedMeal;
}
