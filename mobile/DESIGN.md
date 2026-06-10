# Eats — Design System

**Read this before any UI work. No exceptions.** Every screen in this app shares
one visual language. If you add or change a surface without following this, it
will look like a different app, and that is the one thing this system exists to
prevent.

The tokens live in `lib/theme.ts`. The reusable building blocks live in
`components/ui/`. You should rarely write a raw color hex, border width, or font
size in a screen — pull it from the theme, or reach for a primitive.

---

## The DNA (where the look comes from)

The whole look is translated from a print artifact Diogo loves: a neobrutalist
gym day-card. Its language is **colored chunky ink borders** with **hard offset
shadow blocks** (the shadow is a solid colored rectangle sitting down-and-right
of the card, never a soft blur), **one color identity per item**, **big
condensed display numerals** (Phosphate / Avenir Next Condensed spirit), and the
occasional **playfully rotated chip**. Cards are photo-led, with the image hard
against an inked edge.

We render that DNA onto **OLED black** (the app is used at a 06:30 gym and at
dinner tables — true black is right, and it is not up for debate). On dark, the
ink border becomes a chunky colored border, and the ink-on-paper offset register
becomes a hard, zero-blur shadow block tinted with the card's own identity
color. That colored shadow block is the single most recognisable thing about the
look. Protect it.

---

## Two registers, one language

The app has two emotional contracts but **one design language**. Same borders,
same shadow recipe, same numerals, same section headers — different volume.

| | **FOOD** (calm) | **STRENGTH** (loud) |
|---|---|---|
| Mood | quiet, identity, no celebration | a scoreboard, beats, bold |
| Accent | sage / lime green family | the five exercise colors + amber |
| Border | neutral `ink`, occasional green identity | the exercise's color identity |
| Shadow depth | `soft` | `loud` |
| Language | "plant-leaning", "fiber on track" | "3 beats", "the numbers to beat" |

**The food side is constrained by the product, not just taste.** These are
inviolable (see root `README.md` "Protect the nudge"):

- No streaks, badges, grades, or "you earned!" framing on food.
- The plant heatmap stays a **single hue** (cream → deep green). Never a
  stoplight.
- **Never red on a food surface** to signal a food choice. Sat-fat-over-target is
  amber (`palette.warn`) at most. Real red (`danger`/`dangerStrong`) is only for
  genuine errors and destructive actions (delete), never a verdict on what
  someone ate.

Strength is the opposite by design: it IS a scoreboard, so it gets the loud
register. That asymmetry is intentional — don't "harmonise" it away.

---

## Tokens (`lib/theme.ts`)

| Group | What's in it |
|---|---|
| `palette` | bg layers (`bg`/`surface`/`surfaceAlt`/`surfaceMuted`), `ink`/`inkSoft`/`hairline` borders, `text`/`textMuted`/`textSubtle`/`textFaint`, `food.*`, `plant.*`, `strength.*`, `warn`/`danger`/`dangerStrong`, `onAccent`/`white` |
| `borders` | `chunky` (2.5 — the signature card edge), `bold` (2), `hairline` (1, dividers/inputs only) |
| `radii` | `xs`/`sm`/`md`/`lg`/`xl`/`pill` |
| `offsetShadow(color, depth)` | the hard offset block. `depth` is `"soft"` (food) or `"loud"` (strength). **Always `shadowRadius: 0` — never a blur.** |
| `fontSize` | `micro`…`hero`, one scale |
| `typography` | `displayNumber(Lg)`, `screenTitle`, `sectionHeader`, `body`, `bodyMuted`, `statLabel` |
| `condensedFamily` | `"Avenir Next Condensed"` on iOS (a system font — **no font dependency**). Use for display numerals. |
| `spacing` | `xs`(4)…`xxxl`(32), one 4-based scale |
| `rotate` | `chip` / `chipAlt` — the ±1.5° tilt, for accent chips only |
| `exerciseIdentity(id)` | `{ accent, soft }` per exercise; stable rotation for unseeded ids |
| `plantColor(pct, hasMeals)` | the single-hue plant scale |

`lib/colors.ts` is a **compatibility shim** that re-exports a legacy `colors`
object mapped onto the palette. New code imports from `@/lib/theme`. Don't add
new fields to the shim — add them to the palette.

---

## Primitives (`components/ui/`)

Reach for these before hand-rolling a styled `View`/`Text`.

- **`Card`** — the bordered + offset-shadow surface. Every standalone content
  block is a Card. `identity` colors the border AND the shadow block (omit for
  the neutral food card). `depth="loud"` for strength. `tone="recessed"` for
  quieter nested blocks. `dimmed` for done/disabled. Pass `onPress` to make it
  tappable. For row layouts, pass `flexDirection: "row"` etc. via `style` (it
  wins over the base).
- **`StatNumber`** — a big condensed display numeral + small uppercase label.
  Use anywhere the NUMBER is the point (totals strips, LAST/BEST, live editor
  totals, averages). `color` makes a number "the point" (plant % in lime, a
  confirmed weight in its accent). `flex` to spread evenly in a strip;
  `align="left"` for left-aligned stacks.
- **`SectionHeader`** — the letterspaced uppercase label ("THE NUMBERS TO BEAT").
  `color` to wear a register accent; `trailing` for a count/toggle.
- **`Chip`** — small pill of metadata (kcal, plant %, beats, vibe, provenance).
  `tone` = `neutral`/`accent`/`outline`; `fill`/`textColor` to override (e.g. the
  plant-scale color on a meal badge). `rotated` for the ±1.5° tilt — accent chips
  only, sparingly.
- **`Button`** — the action hierarchy. `variant` = `primary` (filled, offset
  shadow, black-ink label), `secondary` (chunky border), `ghost` (dashed
  affordance), `danger` (destructive). `accent` recolors it (food lime,
  strength amber, an exercise's identity). `size="lg"` for hero actions.

---

## Do / Don't

**Do**
- Put every content block on a `Card`.
- Use `StatNumber` (or `condensedFamily`) for any number that matters.
- Give strength surfaces a color identity + `depth="loud"`; keep food calm.
- Pull every color/size/space from `lib/theme`.
- Keep all four text tiers legible: `text` / `textMuted` / `textSubtle` for
  anything readable. `textFaint` is decorative/placeholder only.

**Don't**
- ❌ Blurred drop shadows (`shadowRadius > 0`). The shadow is a **hard block**.
- ❌ Borderless floating cards. If it's a card, it has a chunky border.
- ❌ Red on a food surface as a verdict. Amber is as loud as food gets.
- ❌ Streaks / badges / grades / stoplight color on food.
- ❌ A multi-hue heatmap. Plant scale is one hue, always.
- ❌ A "photo vs text" mode-chooser or any mode picker UI. One unified surface.
- ❌ Generic gray lists of borderless rows. Rows are Cards or chunky-bordered.
- ❌ Raw hex / magic font sizes in a component. Token it.
- ❌ A font-loading dependency for the condensed look. iOS ships the family.

---

## New-screen checklist

1. `SafeAreaView` with `backgroundColor: palette.bg`.
2. Screen title in `typography.screenTitle` (or a `SectionHeader` for pushed
   screens' uppercase header).
3. Decide the register: **food** (calm, neutral ink, `soft` shadow) or
   **strength** (loud, color identity, `loud` shadow). Don't mix volumes within
   one surface.
4. Every block is a `Card`. Every number that matters is a `StatNumber` /
   condensed numeral. Every section opens with a `SectionHeader`. Every action
   is a `Button`.
5. Inputs: `surfaceMuted` fill, `borders.bold` `inkSoft` border, `radii.sm`.
6. Run tests + `tsc`, then **launch it in the simulator and look at it** —
   composition, contrast (nothing important in `textFaint`), alignment, and that
   the offset shadow blocks read. A screen you haven't looked at isn't done.
