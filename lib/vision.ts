import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type Per100g = {
  sat_fat_g: number;
  soluble_fiber_g: number;
  calories: number;
  protein_g: number;
  // Silent-capture nutrients: stored but not currently surfaced in the UI.
  // Vision returns them so future surfaces (carb-aware suggestions, salt
  // tracking, etc.) can light up without re-parsing existing meals.
  fat_g?: number;
  carbs_g?: number;
  sugar_g?: number;
  salt_g?: number;
};

export type Item = {
  name: string;
  grams: number;
  confidence: "low" | "medium" | "high";
  is_plant: boolean;
  per_100g: Per100g;
};

export type ParsedMeal = {
  items: Item[];
  meal_vibe: string;
  notes: string;
};

const PER_100G_SCHEMA = {
  type: "object",
  properties: {
    sat_fat_g: { type: "number" },
    soluble_fiber_g: { type: "number" },
    calories: { type: "number" },
    protein_g: { type: "number" },
    fat_g: { type: "number" },
    carbs_g: { type: "number" },
    sugar_g: { type: "number" },
    salt_g: { type: "number" },
  },
  required: [
    "sat_fat_g",
    "soluble_fiber_g",
    "calories",
    "protein_g",
    "fat_g",
    "carbs_g",
    "sugar_g",
    "salt_g",
  ],
  additionalProperties: false,
};

const PARSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          grams: { type: "number" },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          is_plant: { type: "boolean" },
          per_100g: PER_100G_SCHEMA,
        },
        required: ["name", "grams", "confidence", "is_plant", "per_100g"],
        additionalProperties: false,
      },
    },
    meal_vibe: { type: "string" },
    notes: { type: "string" },
  },
  required: ["items", "meal_vibe", "notes"],
  additionalProperties: false,
};

const LOOKUP_SCHEMA = {
  type: "object",
  properties: {
    is_plant: { type: "boolean" },
    per_100g: PER_100G_SCHEMA,
  },
  required: ["is_plant", "per_100g"],
  additionalProperties: false,
};

const PARSE_SYSTEM = `You identify foods in a photo of a meal and return per-item nutrition for a personal food log.

The user is on a vegan-leaning, low-saturated-fat protocol aimed at lowering LDL cholesterol — but they are not strict vegan. They want a useful coach, not a calorie counter. **Get the vibe right; don't obsess about precision.** A meal is a choice; your job is to characterize that choice honestly and helpfully.

For each item:
- Name it specifically (e.g. "rolled oats" not "cereal"; "minced beef, lean, cooked" not "meat").
- **Include implicit ingredients the user wouldn't think to mention but are clearly present:**
  - Cooking fats (olive oil, butter, vegetable oil) when food appears sautéed, fried, or roasted — typical home cooking uses 5-15g per dish
  - Dressings on visibly dressed salads (~10-20g)
  - Sauces and condiments typical for the prepared dish
  - Hidden cheese, mayo, butter on bread, oil on pasta
  Mark these "low" confidence — you're inferring from cooking style. The user shouldn't have to add them manually.
- **Composite foods (cakes, breads, pastries, mixed dishes, sandwiches):** when a dish has BOTH plant and non-plant components, **decompose** into 2-4 constituent items whose grams sum to the realistic total. Do NOT name the whole dish *plus* its hidden ingredients separately (that double-counts mass and tanks plant_pct). Example: peanut butter cake → "peanut butter cake batter (peanut butter, flour, sugar)" ~145g plant=true + "butter (in cake)" ~20g plant=false + "eggs (in cake)" ~15g plant=false. The plant base usually dominates by mass even when the dish isn't vegan. Use "low" confidence on inferred component grams.
- Estimate portion in grams: ballpark from plate diameter, food depth, density. Default to typical home portions, not restaurant servings, unless the caption signals otherwise. Don't be micro-precise — the user wants a vibe read, not a calorie audit.
- Flag confidence honestly: "high" only when food + portion are both obvious; "medium" if reasonable; "low" if guessing OR inferring an implicit ingredient. Err toward low rather than overconfident.
- per_100g: standard reference nutrition per 100 grams of that item as prepared (cooked pasta ~158 kcal/100g, olive oil ~884 kcal/100g, etc.).
- is_plant: true if wholly from plants. Olive oil, nuts, beans, fruit, vegetables, grains, legumes → plant. Cheese, butter, eggs, meat, fish, honey, gelatin → not.

**Default context: home cooking.** Assume the user is eating something they made or had made at home in Portugal: olive oil as primary cooking fat (modest 5-15g per dish), simple seasoning, **normal hungry-adult portions** — not restaurant-sized, but also not "disciplined small" portions; assume the user is eating to satisfy hunger, with second helpings possible if the photo or description suggests it. Keep this default unless the caption clearly signals otherwise.

User caption rules (when present):
- Trust ingredient names ("low-sugar", "lean", "homemade", "vegan version").
- Treat size words as portion multiplier: "small plate" / "half" → reduce ~40-50%; "big plate" / "double" → +40-50%; "snack" → small portion.
- **Restaurant / eating-out signals** ("at restaurant", "takeout", "delivery", "ordered", "café", "out for [meal]", "by [restaurant name]", "take-away"): shift assumptions sharply.
  - Portions scale up ~30-40% (restaurant servings are larger than home).
  - Cooking fat is more aggressive: assume butter, cream, oil more generously (15-30g per dish), and likely hidden in sauces, dressings, and pasta water. Pasta dishes often have hidden cream or extra butter. Soups have hidden cream. Salads have heavier dressings (~20-30g).
  - Salt and sugar tend higher; if it's pastry/dessert, sugar is meaningful even if not described as "sweet".
  - Mark these inferred items "low" confidence so the user knows it's a guess.
- **Home-cooking reinforcers** ("homemade", "I made", "at home"): keep home defaults — modest cooking fat, no hidden cream/butter unless visible.
- If caption clearly contradicts photo, trust the photo and call it out in notes.

meal_vibe: a short phrase (≤ 6 words) characterizing this meal *as a choice on the user's protocol*. **Lean toward celebrating what's working** when the meal has plant-forward components, soluble fiber sources, or LDL-helping ingredients. Examples:
- "plant-led, fiber-rich" (oats with berries; beans-and-greens bowl)
- "soluble-fiber breakfast" (oatmeal, lentils, chia, psyllium-anything)
- "balanced mixed plate"
- "veg-heavy with some meat"
- "small snack"
- "fat-heavy treat" (only when butter/cheese/cream genuinely dominates)
- "indulgence" (sweets, fried, very rich)
Be honest but non-judgmental. Don't say "non-vegan" — that's noise. The user is on a *vegan-leaning* plan, not strict vegan. The vibe should help them feel where on the spectrum this meal sits, with a slight bias toward recognizing wins.

notes: ONE short sentence — useful, not preachy. **Prioritize celebrating LDL-helping choices** when present:
- Soluble fiber sources (oats, beans, lentils, chia, psyllium, fruit pectin) — "Good soluble-fiber start to the day."
- Plant sterols (nuts, seeds, fortified spreads) — "Walnuts and olive oil add plant sterols."
- Plant protein (legumes, tofu, tempeh) — "Beans give protein without the saturated fat hit."

Only flag concerns when truly meaningful (don't alarm on a single bite of cheese):
- A truly fat-heavy meal where butter/cheese/cream is the dominant mass
- Hidden ingredient worth knowing (restaurant cream sauce, mayo)
- Portion uncertainty when it actually matters

When neither side is notable, skip notes entirely. Never editorialize about plant-based status; never lecture; never warn about a small bit of saturated fat in an otherwise good meal — the user already feels enough scarcity.`;

export type KnownFood = {
  name: string;
  is_plant: boolean;
  per_100g: Per100g;
};

export type RecentMeal = {
  created_at: number;
  caption: string | null;
  meal_vibe: string | null;
  items: { name: string; grams: number }[];
};

function knownFoodsBlock(foods: KnownFood[]): string {
  if (!foods || foods.length === 0) return "";
  const lines = foods.map((f) => {
    const p = f.per_100g;
    return `- "${f.name}" — plant=${f.is_plant} — per_100g: kcal=${p.calories}, sat_fat=${p.sat_fat_g}, fiber=${p.soluble_fiber_g}, protein=${p.protein_g}`;
  });
  return `\n\n**User's food memory** — items the user has previously logged and confirmed via correction. When something here matches what you see (fuzzy match: small variations in wording, prep, or quantity should still map), use the memory entry's name, is_plant, and per_100g verbatim — these are authoritative. The user has already corrected them. Quantities (grams) are still your call from the photo/text.\n\n${lines.join("\n")}\n\nIf nothing in the memory matches, fall back to standard knowledge.`;
}

function recentMealsBlock(meals: RecentMeal[]): string {
  if (!meals || meals.length === 0) return "";
  const tz = "Europe/Lisbon";
  const lines = meals.map((m) => {
    const d = new Date(m.created_at);
    const when = d.toLocaleString("en-GB", {
      timeZone: tz,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const itemsStr = m.items
      .slice(0, 8)
      .map((i) => `${i.name}${i.grams ? ` ${Math.round(i.grams)}g` : ""}`)
      .join(", ");
    const vibe = m.meal_vibe ? ` [${m.meal_vibe}]` : "";
    const cap = m.caption ? ` — "${m.caption.slice(0, 120)}"` : "";
    return `- ${when}${vibe} ${itemsStr}${cap}`;
  });
  return `\n\n**User's recent meals (last 7 days)** — for context. The user often references previous meals ("same as yesterday", "the usual", "like that other smoothie", "leftover from last night"). Use this list to resolve those references. Match by time of day, item names, or caption similarity.\n\n${lines.join("\n")}\n\nIf the user references a past meal that isn't in this list, say so in notes rather than inventing one.`;
}

const LOOKUP_SYSTEM = `Return standard nutrition per 100 grams (as eaten) for the food the user names, and whether it's wholly from plants. Be a normal, accurate reference — not pessimistic, not generous. If the name is ambiguous, pick the most common interpretation and reflect that in your numbers.`;

const TEXT_SYSTEM = `The user is telling you in plain language what they ate. There is NO photo. Translate the description into a structured meal log entry, the same shape you'd produce from a photo, using all the rules below.

The user is on a vegan-leaning, low-saturated-fat protocol aimed at lowering LDL cholesterol — but they are not strict vegan. They want a useful coach, not a calorie counter. **Get the vibe right; don't obsess about precision.** A meal is a choice; your job is to characterize that choice honestly and helpfully.

For each item:
- Name it specifically.
- **Include implicit ingredients the user wouldn't think to mention but are clearly present** given the dish: cooking fats (olive oil, butter), dressings, sauces, hidden cheese/cream/butter typical for the named dish. Mark "low" confidence — they're inferred.
- **Composite foods (cakes, breads, pastries, mixed dishes, sandwiches):** when a dish has BOTH plant and non-plant components, decompose into 2-4 constituent items whose grams sum to the realistic total. Do NOT name the whole dish *plus* its hidden ingredients separately (that double-counts mass and tanks plant_pct). Example: peanut butter cake → "peanut butter cake batter (peanut butter, flour, sugar)" ~145g plant=true + "butter (in cake)" ~20g plant=false + "eggs (in cake)" ~15g plant=false. The plant base usually dominates by mass even when the dish isn't vegan.
- Estimate portion in grams. Use any size hints in the text ("two slices", "a small bowl", "a handful"). Without size hints, use typical adult-hungry portions for that dish — not restaurant-sized, but not "disciplined small" either.
- Confidence "high" only when the food + portion are both well-described; "medium" if reasonable; "low" if guessing or inferring.
- per_100g: standard reference nutrition per 100 grams of that item as eaten.
- is_plant: true if wholly from plants.

**Default context: home cooking** in Portugal (modest olive oil, simple seasoning, normal hungry-adult portions). Override only if the user's text signals otherwise.

Restaurant / eating-out signals in the user's text ("at restaurant", "takeout", "delivery", "ordered", "café", "out for [meal]", "by [name]", "take-away") shift assumptions: portions ~30-40% larger, hidden butter/cream/oil more generous (15-30g per dish), salads with heavier dressings, sweets and pastries with meaningful sugar. Mark inferred restaurant-style ingredients "low" confidence.

Home-cooking reinforcers ("homemade", "I made", "at home"): keep home defaults.

meal_vibe: short phrase (≤ 6 words). **Lean toward celebrating what's working** when plant-forward / fiber-rich. Examples: "soluble-fiber breakfast", "plant-led, fiber-rich", "balanced plate", "veg-heavy with some meat", "small snack", "fat-heavy treat" (only when truly fat-dominant), "indulgence". The user is *vegan-leaning*, not strict vegan — don't say "non-vegan" as a flag.

notes: ONE short sentence — useful, not preachy. **Prioritize celebrating LDL-helping choices** when present (soluble-fiber sources like oats/beans/lentils/chia, plant sterols, plant protein). Only flag concerns when truly meaningful — single bites of cheese or a normal pat of butter don't warrant a callout. Skip notes when the meal is unremarkable. Never editorialize about plant-based status; never lecture.`;

export async function parseMealPhoto(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  caption?: string,
  knownFoods?: KnownFood[],
  recentMeals?: RecentMeal[]
): Promise<ParsedMeal> {
  const cleanCaption = caption?.trim();
  const userText = cleanCaption
    ? `Identify the items in this meal and return per-item nutrition.\n\nUser's note: "${cleanCaption}"`
    : "Identify the items in this meal and return per-item nutrition.";

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: PARSE_SCHEMA },
    },
    system:
      PARSE_SYSTEM + knownFoodsBlock(knownFoods ?? []) + recentMealsBlock(recentMeals ?? []),
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

const EDIT_SCHEMA = {
  type: "object",
  properties: {
    items: PARSE_SCHEMA.properties.items,
  },
  required: ["items"],
  additionalProperties: false,
};

const EDIT_SYSTEM = `The user is correcting a previously parsed meal log entry. You receive the current items array and a short message from the user. Return the updated items array in the same shape.

Rules:
- Be conservative. Change ONLY what the user explicitly says or strongly implies. Keep everything else unchanged.
- Common corrections:
  - "It's all plant" / "100% vegan" / "the milk is oat milk" → flip is_plant=true on the misclassified items (and update per_100g if a swap implies different nutrition, e.g. dairy milk → oat milk).
  - "Smaller portion" / "half of that" → reduce grams (~50%) on the relevant items.
  - "Bigger" / "double" → increase grams.
  - "Add olive oil 10g" / "I forgot the bread" → append a new item with sensible per_100g and is_plant.
  - "Remove the cheese" → drop that item.
  - "It's actually salmon, not trout" → rename + update per_100g + is_plant if needed.
  - "Confident on portions" → bump confidence up.
- If a name change implies different nutrition, update per_100g accordingly.
- If the message is vague, do your best, but err toward minimal change.
- Always return the FULL updated items array (not a diff).`;

export async function editMealItems(
  currentItems: Item[],
  message: string,
  knownFoods?: KnownFood[],
  recentMeals?: RecentMeal[]
): Promise<Item[]> {
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    output_config: {
      format: { type: "json_schema", schema: EDIT_SCHEMA },
    },
    system:
      EDIT_SYSTEM + knownFoodsBlock(knownFoods ?? []) + recentMealsBlock(recentMeals ?? []),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Current items:\n${JSON.stringify(currentItems, null, 2)}\n\nUser correction: "${message}"\n\nReturn the full updated items array.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  const parsed = JSON.parse(textBlock.text) as { items: Item[] };
  return parsed.items;
}

export async function parseMealText(
  text: string,
  knownFoods?: KnownFood[],
  recentMeals?: RecentMeal[]
): Promise<ParsedMeal> {
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: PARSE_SCHEMA },
    },
    system:
      TEXT_SYSTEM + knownFoodsBlock(knownFoods ?? []) + recentMealsBlock(recentMeals ?? []),
    messages: [
      {
        role: "user",
        content: [{ type: "text", text }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  return JSON.parse(textBlock.text) as ParsedMeal;
}

export type LookupResult = { is_plant: boolean; per_100g: Per100g };

export async function lookupFood(name: string): Promise<LookupResult> {
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    output_config: {
      format: { type: "json_schema", schema: LOOKUP_SCHEMA },
    },
    system: LOOKUP_SYSTEM,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: `Food: ${name}` }],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  return JSON.parse(textBlock.text) as LookupResult;
}

// Pure helpers — exported for the API routes and any future client-side use.
export function totalsFromItems(items: Item[]) {
  let sat_fat_g = 0;
  let soluble_fiber_g = 0;
  let calories = 0;
  let protein_g = 0;
  let fat_g = 0;
  let carbs_g = 0;
  let sugar_g = 0;
  let salt_g = 0;
  let plant_grams = 0;
  let total_grams = 0;
  for (const i of items) {
    const f = i.grams / 100;
    const p = i.per_100g;
    sat_fat_g += p.sat_fat_g * f;
    soluble_fiber_g += p.soluble_fiber_g * f;
    calories += p.calories * f;
    protein_g += p.protein_g * f;
    // Silent-capture totals: skip if missing (older items pre-schema bump).
    if (typeof p.fat_g === "number") fat_g += p.fat_g * f;
    if (typeof p.carbs_g === "number") carbs_g += p.carbs_g * f;
    if (typeof p.sugar_g === "number") sugar_g += p.sugar_g * f;
    if (typeof p.salt_g === "number") salt_g += p.salt_g * f;
    total_grams += i.grams;
    if (i.is_plant) plant_grams += i.grams;
  }
  const plant_pct = total_grams > 0 ? Math.round((plant_grams / total_grams) * 100) : 0;
  return {
    sat_fat_g: round1(sat_fat_g),
    soluble_fiber_g: round1(soluble_fiber_g),
    calories: Math.round(calories),
    protein_g: round1(protein_g),
    fat_g: round1(fat_g),
    carbs_g: round1(carbs_g),
    sugar_g: round1(sugar_g),
    salt_g: round1(salt_g),
    plant_pct,
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
