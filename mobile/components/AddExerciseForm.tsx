// AddExerciseForm — the picker's "+ new exercise" flow (DESIGN.md picker
// zones). Born from a real gym-floor failure: the seated row was taken, the
// app offered no alternative AND no way to add the exercise the owner
// improvised, so it lived only in a freeform note. This is the 10-second
// add: a name, a one-tap measurement-type choice in plain language, an
// optional form cue — then it's a real, loggable exercise.
//
// Flow:
//   - name (text) + measurement-type (three options) + optional description
//   - submit → POST /api/strength/exercises
//   - 409 (case-insensitive dupe) → the form swaps to "already there" and
//     offers the echoed exercise with a "use that one" button, instead of
//     minting a near-duplicate.
//   - success (new or "use that one") → onCreated(exercise); the caller
//     injects it into the draft and opens its entry immediately.
//
// Loud register: the strength amber accent on the inputs + the primary
// action, the exercise color identities on the type cards. Lives inside the
// session's KeyboardAwareScrollView, so the name/description fields scroll
// above the keyboard like every other form (DESIGN.md form contract).

import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { Card, Button, Input } from "@/components/ui";
import {
  ApiError,
  ExerciseConflictError,
  createStrengthExercise,
} from "@/lib/api";
import type { Exercise, MeasurementType } from "@/lib/strengthTypes";

// The three measurement types, in the plain language the spec mandates —
// no jargon, what the lifter actually does.
const TYPE_OPTIONS: { type: MeasurementType; label: string; hint: string }[] = [
  { type: "weight_reps", label: "weight × reps", hint: "a weighted machine or free weight" },
  { type: "bodyweight_reps", label: "bodyweight reps", hint: "just your body — push-ups, back extensions" },
  { type: "carry", label: "carry: kg per hand + steps", hint: "loaded walk — farmer's carry" },
];

type Props = {
  // Called with the resulting exercise (created, or the existing one on
  // "use that one") so the caller can add it to the draft + open its entry.
  onCreated: (exercise: Exercise) => void;
  // Cancel — collapse the form back to the "+ new exercise" affordance.
  onCancel: () => void;
};

export function AddExerciseForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<MeasurementType>("weight_reps");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // When the name collides with an existing exercise, hold it here and
  // offer "use that one" instead of letting the user retry into the same 409.
  const [conflict, setConflict] = useState<Exercise | null>(null);

  const canSubmit = name.trim().length > 0 && !submitting;

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    setConflict(null);
    try {
      const exercise = await createStrengthExercise({
        name: trimmed,
        measurement_type: type,
        description: description.trim() || undefined,
      });
      onCreated(exercise);
    } catch (err) {
      if (err instanceof ExerciseConflictError) {
        setConflict(err.exercise);
      } else {
        setError(
          err instanceof ApiError ? err.message : "Couldn't add the exercise"
        );
      }
      setSubmitting(false);
    }
  }

  // The dupe state — a calm "already in your catalog" with one tap to use it.
  if (conflict) {
    return (
      <Card identity={palette.strength.brand} depth="loud" style={styles.card}>
        <Text style={styles.dupeTitle}>Already in your catalog</Text>
        <Text style={styles.dupeBody}>
          “{conflict.name}” already exists. Use that one?
        </Text>
        <Button
          label={`Use ${conflict.name}`}
          variant="primary"
          accent={palette.strength.brand}
          onPress={() => onCreated(conflict)}
          accessibilityLabel="use the existing exercise"
        />
        <TouchableOpacity onPress={() => setConflict(null)} style={styles.linkBtn}>
          <Text style={styles.linkText}>pick a different name</Text>
        </TouchableOpacity>
      </Card>
    );
  }

  return (
    <Card identity={palette.strength.brand} depth="loud" style={styles.card}>
      <Text style={styles.title}>NEW EXERCISE</Text>

      <Input
        value={name}
        onChangeText={setName}
        accent={palette.strength.brand}
        placeholder="e.g. tricep pulley"
        autoFocus
        autoCapitalize="sentences"
        maxLength={60}
        accessibilityLabel="new exercise name"
      />

      <Text style={styles.fieldLabel}>HOW IT'S MEASURED</Text>
      <View style={styles.typeList}>
        {TYPE_OPTIONS.map((opt) => {
          const selected = type === opt.type;
          return (
            <TouchableOpacity
              key={opt.type}
              onPress={() => setType(opt.type)}
              style={[
                styles.typeRow,
                selected && {
                  borderColor: palette.strength.brand,
                  backgroundColor: palette.surface,
                },
              ]}
              accessibilityLabel={`measured as ${opt.label}`}
              accessibilityState={{ selected }}
            >
              <View
                style={[
                  styles.radio,
                  selected && { borderColor: palette.strength.brand },
                ]}
              >
                {selected ? (
                  <View style={styles.radioDot} />
                ) : null}
              </View>
              <View style={styles.typeText}>
                <Text
                  style={[
                    styles.typeLabel,
                    selected && { color: palette.strength.brandBright },
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.typeHint}>{opt.hint}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>FORM CUE (OPTIONAL)</Text>
      <Input
        variant="multiline"
        value={description}
        onChangeText={setDescription}
        accent={palette.strength.brand}
        placeholder="elbows pinned, push down, control the way up..."
        maxLength={280}
        accessibilityLabel="new exercise description"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Button
          label="Add & log it"
          variant="primary"
          accent={palette.strength.brand}
          loading={submitting}
          disabled={!canSubmit}
          onPress={submit}
          accessibilityLabel="add the new exercise"
        />
        <TouchableOpacity onPress={onCancel} style={styles.linkBtn}>
          <Text style={styles.linkText}>cancel</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.tiny,
    color: palette.strength.brandBright,
    letterSpacing: 1,
    fontWeight: "800",
  },
  fieldLabel: {
    fontSize: fontSize.tiny,
    color: palette.textSubtle,
    letterSpacing: 1,
    fontWeight: "700",
    marginTop: spacing.xs,
  },
  typeList: {
    gap: spacing.sm,
  },
  // Interior selectable rows — hairline border (not chunky), so they don't
  // double the card's ink (DESIGN.md depth rule: one chunky border per unit).
  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: palette.surfaceMuted,
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
    padding: spacing.md,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    borderWidth: borders.bold,
    borderColor: palette.inkSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: palette.strength.brand,
  },
  typeText: {
    flex: 1,
    gap: 2,
  },
  typeLabel: {
    fontSize: fontSize.body,
    fontWeight: "700",
    color: palette.text,
  },
  typeHint: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
  },
  error: {
    fontSize: fontSize.caption,
    color: palette.danger,
    lineHeight: 18,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  linkText: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
  },
  dupeTitle: {
    fontSize: fontSize.body,
    fontWeight: "800",
    color: palette.strength.brandBright,
  },
  dupeBody: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    lineHeight: 19,
    marginBottom: spacing.xs,
  },
});
