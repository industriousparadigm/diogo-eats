import Anthropic from "@anthropic-ai/sdk";
import { totalsFromItems, type Item, type Per100g } from "./totals";

const client = new Anthropic();

// Re-export the arithmetic heart + item shapes from the client-safe
// module so the many server callers that import `from "@/lib/vision"`
// don't have to change. totalsFromItems lives in lib/totals.ts because
// this file instantiates the Anthropic SDK at import time (browser-fatal).
export { totalsFromItems, type Item, type Per100g };

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
    alcohol_g: { type: "number" },
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
    "alcohol_g",
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

const LABEL_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    is_plant: { type: "boolean" },
    per_100g: PER_100G_SCHEMA,
  },
  required: ["name", "is_plant", "per_100g"],
  additionalProperties: false,
};

// Exported for tests: prompt invariants (e.g. the no-double-counting rule)
// are load-bearing daily behavior and must not silently regress.
export const PARSE_SYSTEM = `You identify foods in a photo of a meal and return per-item nutrition for a personal food log.

The user is on a vegan-leaning, low-saturated-fat protocol aimed at lowering LDL cholesterol — but they are not strict vegan. They want a useful coach, not a calorie counter. **Get the vibe right; don't obsess about precision.** A meal is a choice; your job is to characterize that choice honestly and helpfully.

For each item:
- Name it specifically (e.g. "rolled oats" not "cereal"; "minced beef, lean, cooked" not "meat").
- **Include implicit ingredients the user wouldn't think to mention but are clearly present:**
  - Cooking fats (olive oil, butter, vegetable oil) when food appears sautéed, fried, or roasted — typical home cooking uses 5-15g per dish
  - Dressings on visibly dressed salads (~10-20g)
  - Sauces and condiments typical for the prepared dish
  - Hidden cheese, mayo, butter on bread, oil on pasta
  Mark these "low" confidence — you're inferring from cooking style. The user shouldn't have to add them manually.
- **One representation only — never both.** When a cooking fat or hidden ingredient becomes its own item, the host dish's name and per_100g must EXCLUDE it. "scrambled eggs" (plain egg nutrition) + "butter (cooking)" is correct; "eggs made with butter" PLUS a separate "butter used in the eggs" counts the same butter twice — never do that. Same rule for oil on roasted vegetables, cream in soup, dressing on salad: if it's a separate item, the host item is the plain food.
- **Exactness beats inference.** When the photo or caption provides the product's own nutrition (a label panel, official menu macros, manufacturer data), that data is ground truth — never replace it with invented per-component reference values.
  - Product wholly plant OR wholly non-plant (energy bars, yogurts, drinks, plain breads): **ONE item**, named as the product, per_100g derived from the provided data, grams = the portion eaten, confidence "high". Do NOT decompose it into its ingredients.
  - MIXED plant/non-plant product with exact data (a branded pizza, a filled pastry): you may still split it — but ONLY to keep plant share honest, and the components' combined nutrition MUST reproduce the provided data for the eaten portion. The label is a budget to apportion, never to overrule.
- **Composite foods (cakes, breads, pastries, mixed dishes, sandwiches) WITHOUT exact product data:** when a dish has BOTH plant and non-plant components, **decompose** into 2-4 constituent items whose grams sum to the realistic total. Do NOT name the whole dish *plus* its hidden ingredients separately (that double-counts mass and tanks plant_pct). Example: peanut butter cake → "peanut butter cake batter (peanut butter, flour, sugar)" ~145g plant=true + "butter (in cake)" ~20g plant=false + "eggs (in cake)" ~15g plant=false. The plant base usually dominates by mass even when the dish isn't vegan. Use "low" confidence on inferred component grams.
- Estimate portion in grams: ballpark from plate diameter, food depth, density. Default to typical home portions, not restaurant servings, unless the caption signals otherwise. Don't be micro-precise — the user wants a vibe read, not a calorie audit.
- Flag confidence honestly: "high" only when food + portion are both obvious; "medium" if reasonable; "low" if guessing OR inferring an implicit ingredient. Err toward low rather than overconfident.
- per_100g: standard reference nutrition per 100 grams of that item as prepared (cooked pasta ~158 kcal/100g, olive oil ~884 kcal/100g, etc.).
- is_plant: true if wholly from plants. Olive oil, nuts, beans, fruit, vegetables, grains, legumes → plant. Cheese, butter, eggs, meat, fish, honey, gelatin → not.
- alcohol_g (per_100g): pure ethanol grams per 100g of the as-served item. 0 for non-alcoholic foods. Reference:
  - Beer (~5% ABV) ≈ 4g/100g; lager / IPA similar
  - Wine red/white (~12-14% ABV) ≈ 10g/100g
  - Champagne / prosecco (~12% ABV) ≈ 10g/100g
  - Fortified wines (port, sherry, vermouth, ~17-20% ABV) ≈ 15g/100g
  - Spirits (gin, vodka, whisky, rum, tequila, ~40% ABV) ≈ 32g/100g
  - Liqueurs (limoncello, amaretto, baileys, ~25-30% ABV) ≈ 22g/100g
  - Cocktails: estimate from ABV of components; a standard ~120mL spirits-based cocktail ≈ 14-18g/100g of drink mass
  - Cooking wine that's been simmered for 20+ min retains ~30% of original alcohol; flambé items < 25%
  - If the dish is alcohol-cooked but you can't tell how much remains, prefer the lower estimate
- **When an item contains alcohol, name it specifically with the type** (e.g. "red wine", "port", "limoncello", "gin tonic") so downstream flagging works even if alcohol_g is conservative.

**Alcohol detection — important.** A drink (wine, beer, cocktail, spirits, liqueur) is its OWN item — never roll it into the food it accompanies. Estimate grams by container/glass size:
- Wine glass: typically 120-180mL ≈ 120-180g
- Pint of beer: ~500mL ≈ 500g
- Bottle of beer: ~330mL ≈ 330g
- Shot of spirits: ~40-50mL ≈ 40-50g (single) / 80-100g (double)
- Cocktail: ~150-250mL ≈ 150-250g
- Glass of port / liqueur: ~50-80mL ≈ 50-80g
If the user's caption mentions wine, cerveja, vinho, gin, cocktail, "had a beer", etc., include it as an item even without a visible glass. Same for visibly empty / half-drunk glasses in the photo.

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

When neither side is notable, skip notes entirely. Never editorialize about plant-based status; never lecture; never warn about a small bit of saturated fat in an otherwise good meal — the user already feels enough scarcity.

**Training context** — if a "User's training context (Garmin, today)" block appears below, you MAY weave a one-clause reference into notes WHEN it's genuinely relevant to this meal. Examples worth mentioning: a high-protein meal soon after a heavy strain workout ("Solid protein after that paddle session."), a thin meal on a high-strain day ("Light for a 14+ strain day — consider topping up."), a recovery-supportive fiber-rich meal on a low-recovery day ("Fiber + plant protein on a low-recovery day — fits."). Do NOT shoehorn training into every meal. Silence is fine. Never moralize about the workout itself.`;

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

// Label parsing is deterministic by design: read the printed panel, do
// NOT estimate. Exported so the "read off the panel, never guess" rule is
// pinned by a prompt-invariant test the same way PARSE/TEXT are.
export const LABEL_SYSTEM = `You are reading a packaged-food NUTRITION LABEL from a photo to create one authoritative library entry. This is deterministic transcription, not estimation.

Rules:
- **Read the printed values off the panel. Do NOT estimate or infer from typical foods.** If the panel prints per-100g values, use them verbatim. If the panel ONLY prints per-serving values, convert to per-100g using the printed serving size (e.g. "per 30g serving: 120 kcal" → 400 kcal per 100g). Always normalize to per 100 GRAMS (not per serving, not per 100mL — if the product is a liquid measured in mL, treat 100mL ≈ 100g unless a density is printed).
- If a required nutrient is genuinely absent from the label, use 0 — do not invent a plausible number.
- **soluble_fiber_g:** labels print TOTAL fiber, rarely the soluble fraction. If only total fiber is shown, estimate the soluble portion conservatively (typically 20-40% of total for most foods; higher for oats/psyllium/legumes). This is the one field where a printed total must be apportioned — note nothing about it, just produce a reasonable soluble number.
- **salt_g vs sodium:** labels print either salt or sodium. If sodium (mg) is printed, convert: salt_g = sodium_mg × 2.5 ÷ 1000. If salt is printed directly, use it.
- **alcohol_g:** 0 unless the label is an alcoholic product with an ABV; then per_100g ethanol ≈ ABV% × 0.789 (e.g. 5% ABV beer ≈ 4g/100g).
- **name:** a clear, specific display name for the library — prefer the product/brand name printed on the package (e.g. "Chocapic cereal", "Provamel oat milk", "Celeiro chickpea spread"). Keep it short.
- **is_plant:** true if the product is wholly from plants (check the ingredients list if visible: dairy, egg, gelatin, meat, fish, honey → not plant).
- If the image is NOT a readable nutrition label (a plate of food, a blurry photo, no panel), set every per_100g field to 0, name to "unreadable label", is_plant false. The caller will reject it.`;

export const TEXT_SYSTEM = `The user is telling you in plain language what they ate. There is NO photo. Translate the description into a structured meal log entry, the same shape you'd produce from a photo, using all the rules below.

The user is on a vegan-leaning, low-saturated-fat protocol aimed at lowering LDL cholesterol — but they are not strict vegan. They want a useful coach, not a calorie counter. **Get the vibe right; don't obsess about precision.** A meal is a choice; your job is to characterize that choice honestly and helpfully.

For each item:
- Name it specifically.
- **The user authored this list — respect it.** Infer an unmentioned ingredient ONLY when a named preparation method entails it: "fried eggs" implies cooking fat, "sauteed spinach" implies oil, "refogado" implies olive oil. Mark those "low" confidence. But an ASSEMBLED dish the user enumerated ("bread with cheese and ham", "yogurt with banana and oats") is exhaustive as written — do NOT complete it with butter, spreads, dressings, or anything the user didn't say. They typed the list; missing means absent. (This differs from photo parsing, where unstated fats are visible evidence.)
- **One representation only — never both.** When a cooking fat or hidden ingredient becomes its own item, the host dish's name and per_100g must EXCLUDE it. "scrambled eggs" (plain egg nutrition) + "butter (cooking)" is correct; "eggs made with butter" PLUS a separate "butter used in the eggs" counts the same butter twice — never do that. If it's a separate item, the host item is the plain food.
- **Exactness beats inference.** When the user provides the product's own nutrition (label values, official menu macros, "the pack says..."), that data is ground truth — never replace it with invented per-component reference values.
  - Product wholly plant OR wholly non-plant (energy bars, yogurts, drinks, plain breads): **ONE item**, named as the product, per_100g derived from the provided data, grams = the portion eaten, confidence "high". Do NOT decompose it into its ingredients.
  - MIXED plant/non-plant product with exact data (a branded pizza, a filled pastry): you may still split it — but ONLY to keep plant share honest, and the components' combined nutrition MUST reproduce the provided data for the eaten portion. The label is a budget to apportion, never to overrule.
- **Composite foods (cakes, breads, pastries, mixed dishes, sandwiches) WITHOUT exact product data:** when a dish has BOTH plant and non-plant components, decompose into 2-4 constituent items whose grams sum to the realistic total. Do NOT name the whole dish *plus* its hidden ingredients separately (that double-counts mass and tanks plant_pct). Example: peanut butter cake → "peanut butter cake batter (peanut butter, flour, sugar)" ~145g plant=true + "butter (in cake)" ~20g plant=false + "eggs (in cake)" ~15g plant=false. The plant base usually dominates by mass even when the dish isn't vegan.
- Estimate portion in grams. Use any size hints in the text ("two slices", "a small bowl", "a handful"). Without size hints, use typical adult-hungry portions for that dish — not restaurant-sized, but not "disciplined small" either.
- Confidence "high" only when the food + portion are both well-described; "medium" if reasonable; "low" if guessing or inferring.
- per_100g: standard reference nutrition per 100 grams of that item as eaten.
- is_plant: true if wholly from plants.
- alcohol_g (per_100g): pure ethanol grams per 100g. 0 for non-alcoholic items. Reference: beer (~5% ABV) ≈ 4g/100g; wine (~12-14%) ≈ 10g/100g; champagne / prosecco ≈ 10g/100g; fortified wine / port / sherry / vermouth (~17-20%) ≈ 15g/100g; spirits (~40%) ≈ 32g/100g; liqueurs / limoncello / baileys (~25-30%) ≈ 22g/100g.

**Alcohol detection — always log a drink as its OWN item, never roll into the food.** When the user says "wine", "beer", "gin tonic", "cocktail", "vinho", "cerveja", "imperial", "uma branquinha", a port, a champagne, etc., include it. Estimate grams from glass / container size — wine glass ≈ 120-180g, beer bottle ≈ 330g, pint ≈ 500g, shot ≈ 40-50g, cocktail ≈ 150-250g, port/liqueur glass ≈ 50-80g. Name with the type (e.g. "red wine", "port", "limoncello").

**Default context: home cooking** in Portugal (modest olive oil, simple seasoning, normal hungry-adult portions). Override only if the user's text signals otherwise.

Restaurant / eating-out signals in the user's text ("at restaurant", "takeout", "delivery", "ordered", "café", "out for [meal]", "by [name]", "take-away") shift assumptions: portions ~30-40% larger, hidden butter/cream/oil more generous (15-30g per dish), salads with heavier dressings, sweets and pastries with meaningful sugar. Mark inferred restaurant-style ingredients "low" confidence.

Home-cooking reinforcers ("homemade", "I made", "at home"): keep home defaults.

meal_vibe: short phrase (≤ 6 words). **Lean toward celebrating what's working** when plant-forward / fiber-rich. Examples: "soluble-fiber breakfast", "plant-led, fiber-rich", "balanced plate", "veg-heavy with some meat", "small snack", "fat-heavy treat" (only when truly fat-dominant), "indulgence". The user is *vegan-leaning*, not strict vegan — don't say "non-vegan" as a flag.

notes: ONE short sentence — useful, not preachy. **Prioritize celebrating LDL-helping choices** when present (soluble-fiber sources like oats/beans/lentils/chia, plant sterols, plant protein). Only flag concerns when truly meaningful — single bites of cheese or a normal pat of butter don't warrant a callout. Skip notes when the meal is unremarkable. Never editorialize about plant-based status; never lecture.

**Training context** — if a "User's training context (Garmin, today)" block appears below, you MAY add a one-clause training reference to notes WHEN truly relevant (e.g. "Solid protein after the paddle session.", "Light for a heavy-strain day.", "Recovery-supportive on a low-recovery day."). Silence is fine. Never moralize about workouts.`;

export async function parseMealPhoto(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  caption?: string,
  knownFoods?: KnownFood[],
  recentMeals?: RecentMeal[],
  isComposite?: boolean,
  trainingContext?: string
): Promise<ParsedMeal> {
  const cleanCaption = caption?.trim();
  const compositeHint = isComposite
    ? "\n\nThis image is a vertical strip of multiple photos the user took for the same meal. Common patterns: (1) the meal itself plus nutrition labels of one or more components; (2) several nutrition labels of multiple ingredients combined into one dish. Use any nutrition-label panels for deterministic per-100g values; use the meal photo (if present) to estimate portions. Treat panels separated by black gaps as logically distinct photos of the same meal."
    : "";
  const userText = cleanCaption
    ? `Identify the items in this meal and return per-item nutrition.${compositeHint}\n\nUser's note: "${cleanCaption}"`
    : `Identify the items in this meal and return per-item nutrition.${compositeHint}`;

  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: PARSE_SCHEMA },
    },
    system:
      PARSE_SYSTEM +
      knownFoodsBlock(knownFoods ?? []) +
      recentMealsBlock(recentMeals ?? []) +
      (trainingContext ? `\n\n${trainingContext}` : ""),
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
    // Meal-total values the user's message explicitly pinned, AS EATEN.
    // The server recomputes totals from the edited items and verifies
    // against these — the model declaring its own arithmetic is what
    // makes per-100g/total confusion catchable.
    expected_totals: {
      type: "object",
      properties: {
        soluble_fiber_g: { type: "number" },
        sat_fat_g: { type: "number" },
        calories: { type: "number" },
        protein_g: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  required: ["items"],
  additionalProperties: false,
};

// Exported for tests.
export const EDIT_SYSTEM = `The user is correcting a previously parsed meal log entry. You receive the current items array and a short message from the user. Return the updated items array in the same shape.

Rules:
- Be conservative. Change ONLY what the user explicitly says or strongly implies. Keep everything else unchanged.
- **Per-100g vs as-eaten totals — the most common failure mode; read carefully.** Item nutrition is stored PER 100 GRAMS, but the user sees and talks about MEAL TOTALS as eaten. When the user states a number ("this should have around 0.8g soluble fiber", "make it 300 kcal"), they mean the TOTAL. To make an item weighing G grams contribute total T: per_100g value = T / (G / 100). Example: 40g pastry, user wants 0.8g soluble fiber → per_100g.soluble_fiber_g = 0.8 / 0.4 = 2.0. Writing 0.8 into per_100g would yield a 0.32g total — the exact mistake to avoid. Do this arithmetic explicitly before answering.
- **Declare your arithmetic.** When the user's message pins a numeric value for soluble fiber, sat fat, calories, or protein, set expected_totals for exactly those metrics to the meal total your edited items produce. Omit metrics the user didn't constrain. The server verifies your edit against this.
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

export type ExpectedTotals = Partial<
  Record<"soluble_fiber_g" | "sat_fat_g" | "calories" | "protein_g", number>
>;

// Compare the totals an edit actually produces against the totals the
// model declared the user asked for. Tolerance is the larger of 10% of
// the expected value and an absolute floor (gram metrics drift in
// tenths; calories in whole numbers). Exported for tests.
export function expectedTotalsMismatches(
  expected: ExpectedTotals,
  actual: { soluble_fiber_g: number; sat_fat_g: number; calories: number; protein_g: number }
): { metric: string; expected: number; actual: number }[] {
  const out: { metric: string; expected: number; actual: number }[] = [];
  for (const [metric, want] of Object.entries(expected)) {
    if (typeof want !== "number") continue;
    const got = actual[metric as keyof typeof actual];
    const floor = metric === "calories" ? 15 : 0.15;
    const tolerance = Math.max(Math.abs(want) * 0.1, floor);
    if (Math.abs(got - want) > tolerance) {
      out.push({ metric, expected: want, actual: got });
    }
  }
  return out;
}

// Thrown when a correction can't be made to land on the user's stated
// numbers even after a corrective retry. Routes surface this as a 422
// with a human message — an honest failure beats silently-wrong data.
export class CorrectionVerificationError extends Error {
  mismatches: { metric: string; expected: number; actual: number }[];
  constructor(mismatches: { metric: string; expected: number; actual: number }[]) {
    super(
      "the correction didn't land on the numbers you asked for — try rewording (e.g. name the item and the exact value)"
    );
    this.name = "CorrectionVerificationError";
    this.mismatches = mismatches;
  }
}

export async function editMealItems(
  currentItems: Item[],
  message: string,
  knownFoods?: KnownFood[],
  recentMeals?: RecentMeal[]
): Promise<Item[]> {
  const system =
    EDIT_SYSTEM + knownFoodsBlock(knownFoods ?? []) + recentMealsBlock(recentMeals ?? []);
  const userText = `Current items:\n${JSON.stringify(currentItems, null, 2)}\n\nUser correction: "${message}"\n\nReturn the full updated items array.`;

  const first = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    output_config: {
      format: { type: "json_schema", schema: EDIT_SCHEMA },
    },
    system,
    messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
  });

  const firstBlock = first.content.find((b) => b.type === "text");
  if (!firstBlock || firstBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  const firstParsed = JSON.parse(firstBlock.text) as {
    items: Item[];
    expected_totals?: ExpectedTotals;
  };

  // No numeric constraints declared → nothing to verify.
  const expected = firstParsed.expected_totals ?? {};
  let mismatches = expectedTotalsMismatches(expected, totalsFromItems(firstParsed.items));
  if (mismatches.length === 0) return firstParsed.items;

  // The model's own arithmetic missed its declared target (the classic
  // per-100g vs total confusion). One corrective retry with the
  // discrepancy spelled out.
  const correction = mismatches
    .map(
      (m) =>
        `${m.metric}: your items produce ${m.actual} but the user asked for ~${m.expected}. per_100g = desired_total / (grams / 100) — redo the arithmetic.`
    )
    .join("\n");
  const second = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 4096,
    output_config: {
      format: { type: "json_schema", schema: EDIT_SCHEMA },
    },
    system,
    messages: [
      { role: "user", content: [{ type: "text", text: userText }] },
      { role: "assistant", content: [{ type: "text", text: firstBlock.text }] },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Verification failed:\n${correction}\n\nReturn the corrected full items array (and expected_totals).`,
          },
        ],
      },
    ],
  });

  const secondBlock = second.content.find((b) => b.type === "text");
  if (!secondBlock || secondBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  const secondParsed = JSON.parse(secondBlock.text) as {
    items: Item[];
    expected_totals?: ExpectedTotals;
  };
  mismatches = expectedTotalsMismatches(
    secondParsed.expected_totals ?? expected,
    totalsFromItems(secondParsed.items)
  );
  if (mismatches.length > 0) throw new CorrectionVerificationError(mismatches);
  return secondParsed.items;
}

export async function parseMealText(
  text: string,
  knownFoods?: KnownFood[],
  recentMeals?: RecentMeal[],
  trainingContext?: string
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
      TEXT_SYSTEM +
      knownFoodsBlock(knownFoods ?? []) +
      recentMealsBlock(recentMeals ?? []) +
      (trainingContext ? `\n\n${trainingContext}` : ""),
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

export type LabelResult = { name: string; is_plant: boolean; per_100g: Per100g };

// Read a nutrition label photo into one authoritative per-100g library
// entry. Deterministic transcription — see LABEL_SYSTEM. Mirrors the
// model + structured-output style of the other Vision calls.
export async function parseLabel(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp"
): Promise<LabelResult> {
  const response = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    output_config: {
      format: { type: "json_schema", schema: LABEL_SCHEMA },
    },
    system: LABEL_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageBase64 },
          },
          {
            type: "text",
            text: "Read this nutrition label and return one per-100g library entry.",
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from model");
  }
  return JSON.parse(textBlock.text) as LabelResult;
}

