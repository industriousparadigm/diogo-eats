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
- **`Input`** — the one text field. `variant` = `text` / `numeric` /
  `decimal` / `multiline` (picks the keyboard + multiline behaviour).
  `accent` sets the focus-ring color (defaults to food lime; pass a strength
  amber or an exercise identity on loud surfaces). `suffix` shows a fixed
  unit inside the field ("g", "kg"). Never hand-roll a `TextInput` in a
  screen — every field is this primitive (see "Form fields" below).

---

## Form fields

Every text field is the **`Input`** primitive — there is no hand-rolled
`TextInput` in a screen. The recipe is fixed so the meal editor, the
quick-fix box, the session note, settings targets, the foods forms, and
the capture caption all read as one system:

- **Fill** `surfaceMuted`, **border** `borders.bold` in `inkSoft` at rest,
  **radius** `radii.sm`.
- **On focus** the border takes the surface's register **accent** — food
  lime by default, an exercise identity or strength amber on a loud
  surface (pass `accent`). The text-selection caret matches.
- **Placeholder** is the one legitimate use of `textFaint`. Typed text is
  always full `text` — never leave anything a user must read in a faint
  tier.
- **Keyboard** is `keyboardAppearance="dark"` to match the OLED app, and
  the `variant` picks the right keypad (`numeric` / `decimal`) so a
  grams/weight field never opens the alphabet.
- A fixed unit goes in the field via `suffix` ("g", "kg"), not as a
  separate floating label.

**Keyboard avoidance is part of the form contract.** A focused field that
opens behind the keyboard is a broken field. Every screen that scrolls and
holds an `Input` uses the **`KeyboardAwareScrollView`** primitive
(`components/ui/`) as its scroll container — never a bare `ScrollView`, and
never a hand-rolled `KeyboardAvoidingView` + `ScrollView` pair (they drifted:
some screens had the avoider, some didn't, and the ones that did only shrank
the viewport without scrolling a deep field up). The primitive wraps a
`KeyboardAvoidingView` (`padding` on iOS) around a `ScrollView` with iOS's
`automaticallyAdjustKeyboardInsets` — the native piece that lifts whatever
field has focus above the keyboard, however deep in the scroll it sits.

- Screens with a sticky bottom bar (save, "Session complete", running
  totals) pass it as the **`footer`** slot, not as a sibling outside. The
  footer rides up with the keyboard (it's inside the avoider) but stays
  pinned (it's outside the scroll view).
- A centered, non-list form (sign-in) still uses the primitive with
  `contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}` so the
  field stays reachable on the smallest device.
- `__tests__/KeyboardAwareScrollView.test.tsx` guards the wiring
  (insets-on, footer-outside-scroll); the strength session test guards the
  specific regression where the note opened behind the keyboard.
- **Verify with the on-screen keyboard rendered.** A connected hardware
  keyboard in the simulator suppresses the software one, so avoidance "looks
  fine" while it's actually broken. Toggle the simulator's software keyboard
  ON (`I/O > Keyboard > Toggle Software Keyboard`, or
  `defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false`)
  and confirm the keyboard is visible in the screenshot before calling a
  keyboard fix verified.

## Uncertainty

When the system is unsure (Vision guessing a portion, a low-confidence
parse), say so with a **labeled chip, never a bare colored dot**. On
meal-edit item rows a LOW-confidence item wears a small calm `Chip`
labeled **"guess"** (neutral tone — it's the food register, so it informs
without alarming); medium/high wear nothing. A colored ball next to a row
reads as a status light the user must decode; a one-word chip just tells
them. This is also why food never gets a stoplight — uncertainty is
labeled, not color-coded.

## Meal nutrition panel (full picture, calm register)

The meal detail screen (`meal/[id]`) carries a **NUTRITION** panel below the
items — every metric the meal tracks, not just the headline strip. It's one
neutral recessed `Card` (food register: calm ink border, no celebration,
condensed display numerals) holding a two-up grid of label-over-numeral
cells: calories, protein, total fat, sat fat, carbs, sugar, soluble fiber,
salt, then plant% (the one number that's "the point", in food lime). It
recomputes live as grams/items change, off the same `computeNutrition`
helper that feeds the sticky headline bar (one place the portion math
lives — `lib/editTotals.ts`).

Two honesty rules the panel must keep:
- **Absence ≠ zero.** A silent-capture nutrient (fat/carbs/sugar/salt/
  alcohol is optional per item — older meals lack it) shows **"—"** (muted
  tier) only when NO item in the meal carries it, vs **"0.0g"** when it
  summed to a real zero. The helper tracks a `present` flag per silent
  nutrient so the panel can tell them apart.
- **The alcohol row only appears when the meal contains alcohol** (> 0).
  Most meals are 0; a permanent "0.0g alcohol" row is noise, not signal.

## Strength landing (a dashboard, not a catalog)

The strength tab's landing is a SCOREBOARD GLANCE, not a browse surface.
Most opens are not session days, so the landing answers "where am I at?" in
one screenful and gets out of the way. Top to bottom:

- **Start / Resume** (hero): the one unmissable action — a `lg` primary
  `Button` in strength amber. "Resume session" with the in-progress hint when
  a draft exists, "Start session" otherwise.
- **Stat strip** (loud register): three `StatNumber`s on a single **flat**
  `Card` (it's a supporting strip, so it goes flat — the offset block stays
  the signal reserved for the session row Cards beneath it). Sessions this
  month, beats this month (amber numerals — the scoreboard's pulse), and the
  last-session date (neutral). Derived client-side by a pure helper
  (`lib/strengthStats`) from the overview's session summaries; **month
  bucketing is phone-local** (a 23:30 session on the last of the month counts
  in that month, whatever UTC says). Display-only.
- **RECENT SESSIONS** (promoted, amber `SectionHeader`): newest first, capped
  (~10 — the landing is a glance, the long view lives in the library + each
  exercise's career timeline). Each row is a recessed `Card`: date · exercise
  NAMES (not a bare count) + a beats `Chip` (amber when ≥1, neutral at 0).
  Tap → session detail.
- **"All exercises"** (single row, bottom): a quiet chevron row into the
  library. Browsing belongs there, not on the landing.

What is NOT here: the per-exercise "THE NUMBERS TO BEAT" catalog. At a
1000-exercise catalog a full per-exercise scoreboard on the landing is noise;
that job is done better by the in-session picker (the numbers you're about to
beat) and the library + career detail (browsing the long view). The landing
stays a glance.

**The library** (`strength/exercises`) is the full catalog, one tap behind
the "All exercises" row. A strength-accent search `Input` (client-side
contains-match over the names already in the overview payload — a pure helper,
`lib/strengthLibrary`, that scales to 1000) sits in a `KeyboardAwareScrollView`
above one loud `Card` per exercise: image thumb + name in the exercise's
identity + a compact LAST / BEST subline ("not done yet" when untrained).
Tapping a card opens the CAREER detail (browsing → the long view; no
`from=session`). A no-match search says so plainly, never a blank gap.

## Picker zones (the live-session exercise list)

The live-session picker is split into named zones by a `SectionHeader`, so
a 06:30 gym user reaches the thing they actually train without scrolling
the whole catalog — and always has a way out when a machine is taken.

- **YOUR USUAL** (top, strength-amber header): the exercises that appear in
  the user's session history, in the overview's "most likely next" order
  (`picker_order`). This is the original picker, now named.
- **EVERYTHING ELSE** (below, neutral header): the rest of the catalog —
  seeded movements never logged, plus user-created exercises not yet
  trained. It carries a search `Input` (the strength accent) and is
  **rendered only when non-empty**. A no-match search says so in
  `textSubtle` and points at the add affordance, never a blank gap.
- **"+ new exercise"** (bottom, always): a dashed `ghost`-style affordance
  that opens the inline add form (name + a three-way measurement-type
  choice in plain language: "weight × reps" / "bodyweight reps" / "carry:
  kg per hand + steps" + an optional form cue). It posts, handles the 409
  dupe with a calm "use that one", and on success opens the new exercise's
  entry immediately — a 10-second gym-floor flow.

Each pickable card carries a small **"alts"** affordance (a hairline-bordered
chip in the card's identity color, right-aligned) — discoverable, not noisy.
Done-today cards drop it (and sink to the bottom of their own zone, dimmed).
The zone split is a pure helper (`lib/pickerZones.ts`) over the draft — it
only re-buckets the server's order, never recomputes engine state.

## Alternatives sheet ("machine taken?")

Tapping a card's "alts" opens a `pageSheet` modal titled
**"<Exercise> taken? Try:"** in that exercise's color identity. It answers
the real gym failure: the machine you wanted is occupied, now what.

- **Loading** is a **skeleton, never a spinner** — it's a Sonnet call
  (~2-4s). Three `SkeletonCard`s in the blocked exercise's identity, under
  a "FROM YOUR CATALOG" header.
- **Ranked** shows catalog substitutes as tappable identity-colored cards
  (the model's one-line `reason` is the subline); tapping jumps straight
  into that exercise's entry. When the catalog overlap is weak the backend
  also returns 0-2 **suggestions** — new movements worth adding — under an
  amber **"OR ADD:"** header; tapping one creates it (POST, 409 reuses the
  existing) and opens its entry.
- **Empty** (no catalog match and nothing worth adding) says so plainly —
  wait for the machine or pick another. Never a dead end, never a fake.
- **Error** (502) is a clean message + a Retry button. The network is flaky
  at 06:30; the sheet recovers in place.

## Context-aware exercise detail (one screen, two modes)

The exercise detail (`strength/exercise/[id]`) is ONE screen that flips its
content by a `from` route param, so the same surface serves two jobs without
a mode-chooser. Both modes share the **loud register** and the same core.

- **Shared core (both modes):** the image is the HERO — full-width, framed
  in the exercise's color identity, the single loudest `Card` in the app
  (chunky identity border + the `loud` offset block). The name sits below as
  condensed display type in the identity color; then the form-cue
  description. Placeholder-safe for a null `image_key` (the `ExerciseImage`
  primitive). This replaced the old cramped thumbnail-beside-text card.
- **Gym-now (`from=session`):** what a 06:30 lifter needs mid-session and
  nothing else. "LAST TIME" series numbers BIG (the numbers to beat),
  TODAY's already-logged sets if any (read from the live draft), and a
  primary "Log this" button. No career clutter — no BEST card, no
  sparkline, no full timeline. "Log this" hands the exercise back to the
  session via a module store (`stashLogExercise`) and pops back, so the
  session's own picker↔entry state machine opens the entry (detail →
  picker → entry; back stays sane).
- **Career (default):** the scoreboard's long view. BEST as a big
  `StatNumber` with the last-done date, the max-weight progression
  sparkline (≥2 sessions), then the full chronological timeline (date ·
  series, one row each with an identity dot) — vertical rhythm over stacked
  cards.

**Access points (the gym flow is sacred):** the picker CARD BODY always
opens the series entry (the 2-4-tap log path) — never the detail. A small
ⓘ on the picker card's thumbnail is a SEPARATE tap target → gym-now detail.
The entry header (the exercise name) is likewise tappable → gym-now detail.
Overview cards and session-detail rows open the career detail. The two
targets on a picker card (body → entry, ⓘ → detail) must never collide; the
ⓘ press does not bubble to the card body.

**Cold-cache guard:** deep-linking into an exercise whose snapshot is cold
must never render blank. While metadata resolves: the
`ExerciseDetailSkeleton`. If a load attempt completes and the id still
doesn't resolve (removed / not ours): an honest "couldn't find this
exercise" state, never an empty screen.

## Depth rules (the offset block is container-only)

The hard offset block is the signature of the look — and it is a **container
effect**. Two rules keep it from turning into the "boxes doubling up on
outlines" defect (a real shipped bug on the highlights + session-detail beats
cards):

1. **Offset shadows live on containers, never on text.** No `textShadow*` on
   any `Text`, ever. Loud emphasis comes from **color + weight + the Card
   treatment around the text** — never a shadow on the glyphs. A displaced
   copy of a glyph reads as a fuzzy double outline (worst on amber-on-dark).
2. **The block must cast from an OPAQUE rectangle.** On iOS a view with
   `shadowOpacity > 0` + `shadowRadius: 0` (the offset block) **and a
   translucent `backgroundColor`** casts the hard block from the view's
   rendered alpha — its border stroke *and its child text glyphs* — not a
   solid rect. That is literally a hard-displaced copy of the text. So a
   shadowed card's fill is always opaque. To put a register wash on a shadowed
   card (amber `brandSoft`, lime `accentSoft`), pass it as the **`Card`
   `tint` prop** (an inner layer over the opaque base) — never as a
   translucent `style.backgroundColor`. For a hand-rolled shadowed surface
   (not the `Card` primitive), use a pre-composited **opaque** tone (e.g.
   `palette.food.selectedSurface`), not the translucent `*Soft` token.
3. **One chunky border + offset block per visual unit.** Bordered rows inside
   a bordered Card double the ink. Interior subdivisions are **hairline
   separators or plain spacing** — never their own chunky border + shadow.
   (Sibling cards in a list are fine; nesting a chunky-bordered Card inside
   another is not.)

`__tests__/DepthRules.test.tsx` guards all three: the theme carries no
`textShadow*`, and the rendered highlights + session-detail trees contain no
`Text` shadow and no offset-block-over-translucent-fill view.

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
- ❌ A shadow on text (`textShadow*`) — or an offset block over a translucent
  fill (it casts the block from the glyphs → doubled text). Block = container,
  opaque base; washes go through the `Card` `tint` prop. See "Depth rules".
- ❌ A chunky-bordered row inside a chunky-bordered Card. One border + block
  per visual unit; interiors are hairline/spacing. See "Depth rules".
- ❌ Borderless floating cards. If it's a card, it has a chunky border.
- ❌ Red on a food surface as a verdict. Amber is as loud as food gets.
- ❌ Streaks / badges / grades / stoplight color on food.
- ❌ A multi-hue heatmap. Plant scale is one hue, always.
- ❌ A "photo vs text" mode-chooser or any mode picker UI. One unified surface.
- ❌ Generic gray lists of borderless rows. Rows are Cards or chunky-bordered.
- ❌ A hand-rolled `TextInput` in a screen. Use the `Input` primitive.
- ❌ A bare colored dot for uncertainty. Label it with a chip.
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
   **Depth check:** no `textShadow*` anywhere; any shadowed card with a
   register wash uses the `Card` `tint` prop (opaque base), not a translucent
   `backgroundColor`; no chunky border nested inside a chunky-bordered card
   (interiors are hairline/spacing). See "Depth rules".
5. Inputs: the `Input` primitive (never a raw `TextInput`) — see "Form
   fields". Uncertainty is a labeled chip, never a colored dot.
6. Run tests + `tsc`, then **launch it in the simulator and look at it** —
   composition, contrast (nothing important in `textFaint`), alignment, and that
   the offset shadow blocks read. A screen you haven't looked at isn't done.
