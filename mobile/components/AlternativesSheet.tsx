// AlternativesSheet — the "machine taken?" brain (DESIGN.md alternatives
// sheet). Born from the same gym-floor failure as the add-new flow: the
// seated row was occupied and the app had no answer. Now every picker card
// carries a small "alts" affordance; tapping it opens this sheet titled
// "<Exercise> taken? Try:" and asks the backend what to do instead.
//
// States (all honest, never a dead end):
//   loading  — a Sonnet call runs ~2-4s; show a skeleton, not a spinner.
//   ranked   — catalog substitutes as tappable cards (reason = the subline);
//              tap → jump straight into that exercise's entry. When the
//              backend also returns suggestions (new movements worth adding,
//              only when catalog overlap is weak), an "or add:" section
//              lets the user create one (POST) and open it — 409 reuses the
//              existing exercise.
//   empty    — no alternatives AND no suggestions: say so plainly.
//   error    — 502 "couldn't fetch alternatives": clean message + retry.
//
// Loud register: the blocked exercise's own color identity threads through
// the sheet; the add-new path wears strength amber.

import { useCallback, useEffect, useState } from "react";
import { Modal, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette, radii, borders, fontSize, spacing, exerciseIdentity } from "@/lib/theme";
import { Card, SectionHeader, SkeletonCard, SkeletonBlock } from "@/components/ui";
import { ExerciseImage } from "@/components/ExerciseImage";
import {
  ApiError,
  ExerciseConflictError,
  createStrengthExercise,
  fetchAlternatives,
} from "@/lib/api";
import { fmtMeasurementType } from "@/lib/strengthFormat";
import type {
  AlternativesResult,
  Exercise,
  MeasurementType,
  NewSuggestion,
} from "@/lib/strengthTypes";

type Props = {
  visible: boolean;
  // The blocked exercise (the one that's taken). Null when closed.
  exercise: Exercise | null;
  // Resolve a catalog exercise id → its display data (for the alternative
  // cards' name + image), from the live draft's catalog.
  catalogById: Map<string, Exercise>;
  onClose: () => void;
  // Tapped a catalog alternative → open that exercise's entry.
  onPickExisting: (exerciseId: string) => void;
  // Tapped an "or add:" suggestion and it was created (or matched an
  // existing one via 409) → inject + open. The caller adds it to the draft.
  onCreated: (exercise: Exercise) => void;
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; result: AlternativesResult }
  | { kind: "error"; message: string };

export function AlternativesSheet({
  visible,
  exercise,
  catalogById,
  onClose,
  onPickExisting,
  onCreated,
}: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });
  // Which suggestion (by name) is mid-create, so its card can show a pending
  // state and double-taps are ignored.
  const [creating, setCreating] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async (ex: Exercise) => {
    setState({ kind: "loading" });
    setCreateError(null);
    try {
      const result = await fetchAlternatives(ex.id);
      setState({ kind: "ready", result });
    } catch (err) {
      setState({
        kind: "error",
        message:
          err instanceof ApiError ? err.message : "Couldn't fetch alternatives",
      });
    }
  }, []);

  useEffect(() => {
    if (visible && exercise) {
      load(exercise);
    }
  }, [visible, exercise, load]);

  async function addSuggestion(s: NewSuggestion) {
    if (creating) return;
    setCreating(s.name);
    setCreateError(null);
    try {
      const created = await createStrengthExercise({
        name: s.name,
        measurement_type: s.measurement_type,
        description: s.description,
      });
      onCreated(created);
    } catch (err) {
      if (err instanceof ExerciseConflictError) {
        // The suggested name already exists — reuse it rather than fail.
        onCreated(err.exercise);
      } else {
        setCreateError(
          err instanceof ApiError ? err.message : "Couldn't add that one"
        );
        setCreating(null);
      }
    }
  }

  const accent = exercise
    ? exerciseIdentity(exercise.id).accent
    : palette.strength.brand;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.sheet} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.header}>
          <View style={styles.closeBtn} />
          <Text style={[styles.title, { color: accent }]} numberOfLines={2}>
            {exercise ? `${exercise.name} taken? Try:` : "Try:"}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityLabel="close alternatives"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.closeText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          {state.kind === "loading" && <AlternativesSkeleton accent={accent} />}

          {state.kind === "error" && (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{state.message}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => exercise && load(exercise)}
                accessibilityLabel="retry alternatives"
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {state.kind === "ready" && (
            <ReadyView
              result={state.result}
              accent={accent}
              catalogById={catalogById}
              creating={creating}
              createError={createError}
              onPickExisting={onPickExisting}
              onAddSuggestion={addSuggestion}
            />
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ReadyView({
  result,
  accent,
  catalogById,
  creating,
  createError,
  onPickExisting,
  onAddSuggestion,
}: {
  result: AlternativesResult;
  accent: string;
  catalogById: Map<string, Exercise>;
  creating: string | null;
  createError: string | null;
  onPickExisting: (exerciseId: string) => void;
  onAddSuggestion: (s: NewSuggestion) => void;
}) {
  const { alternatives, suggestions } = result;
  const hasAlts = alternatives.length > 0;
  const hasSuggestions = suggestions.length > 0;

  // Honest empty: nothing in the catalog substitutes AND nothing worth
  // adding. Don't pretend; tell the user to wait for the machine or move on.
  if (!hasAlts && !hasSuggestions) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>
          Nothing close enough to swap in. Wait for it, or pick another machine
          from the list.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.readyWrap}>
      {hasAlts && (
        <>
          <SectionHeader color={accent}>FROM YOUR CATALOG</SectionHeader>
          <View style={styles.list}>
            {alternatives.map((alt) => {
              const ex = catalogById.get(alt.exercise_id);
              const altAccent = exerciseIdentity(alt.exercise_id).accent;
              return (
                <Card
                  key={alt.exercise_id}
                  identity={altAccent}
                  depth="loud"
                  style={styles.altCard}
                  onPress={() => onPickExisting(alt.exercise_id)}
                  accessibilityLabel={`use ${ex?.name ?? alt.exercise_id} instead`}
                >
                  <ExerciseImage
                    imageKey={ex?.image_key ?? null}
                    style={styles.altImage}
                  />
                  <View style={styles.altBody}>
                    <Text style={[styles.altName, { color: altAccent }]}>
                      {ex?.name ?? alt.exercise_id}
                    </Text>
                    <Text style={styles.altReason}>{alt.reason}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
        </>
      )}

      {hasSuggestions && (
        <>
          <SectionHeader color={palette.strength.brand} style={styles.orAdd}>
            OR ADD:
          </SectionHeader>
          <View style={styles.list}>
            {suggestions.map((s) => {
              const pending = creating === s.name;
              return (
                <Card
                  key={s.name}
                  identity={palette.strength.brand}
                  depth="loud"
                  tint={palette.strength.brandSoft}
                  style={styles.altCard}
                  onPress={() => onAddSuggestion(s)}
                  disabled={creating !== null}
                  dimmed={pending}
                  accessibilityLabel={`add ${s.name}`}
                >
                  <View style={styles.addBody}>
                    <Text style={styles.addName}>
                      {pending ? `Adding ${s.name}…` : `+ ${s.name}`}
                    </Text>
                    <Text style={styles.addMeta}>
                      {fmtMeasurementType(s.measurement_type)}
                    </Text>
                    <Text style={styles.altReason}>{s.reason}</Text>
                  </View>
                </Card>
              );
            })}
          </View>
          {createError ? <Text style={styles.createError}>{createError}</Text> : null}
        </>
      )}
    </View>
  );
}

function AlternativesSkeleton({ accent }: { accent: string }) {
  return (
    <View accessibilityLabel="loading alternatives" style={styles.readyWrap}>
      <SectionHeader color={accent}>FROM YOUR CATALOG</SectionHeader>
      <View style={styles.list}>
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} identity={accent} depth="loud" style={styles.altCard}>
            <SkeletonBlock width={56} height={42} radius={radii.sm} tone="bright" />
            <View style={styles.altBody}>
              <SkeletonBlock width="45%" height={15} tone="bright" />
              <SkeletonBlock width="80%" height={12} />
            </View>
          </SkeletonCard>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: borders.bold,
    borderBottomColor: palette.ink,
    gap: spacing.sm,
  },
  closeBtn: {
    minWidth: 52,
    alignItems: "flex-end",
  },
  closeText: {
    fontSize: fontSize.body,
    color: palette.textMuted,
    fontWeight: "600",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: fontSize.title,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
  },
  readyWrap: {
    gap: spacing.md,
  },
  list: {
    gap: spacing.md,
  },
  orAdd: {
    marginTop: spacing.sm,
  },
  altCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  altImage: {
    width: 56,
    height: 42,
    borderRadius: radii.sm,
    backgroundColor: palette.white,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  altBody: {
    flex: 1,
    gap: 3,
  },
  altName: {
    fontSize: fontSize.bodyLg,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  altReason: {
    fontSize: fontSize.caption,
    color: palette.textMuted,
    lineHeight: 17,
  },
  addBody: {
    flex: 1,
    gap: 3,
  },
  addName: {
    fontSize: fontSize.bodyLg,
    fontWeight: "800",
    color: palette.strength.brandBright,
    letterSpacing: -0.2,
  },
  addMeta: {
    fontSize: fontSize.micro,
    color: palette.textSubtle,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  createError: {
    fontSize: fontSize.caption,
    color: palette.danger,
    lineHeight: 18,
  },
  emptyWrap: {
    paddingTop: spacing.xl,
  },
  emptyText: {
    fontSize: fontSize.body,
    color: palette.textMuted,
    lineHeight: 22,
  },
  errorWrap: {
    alignItems: "center",
    gap: spacing.md,
    paddingTop: spacing.xxl,
  },
  errorText: {
    fontSize: fontSize.body,
    color: palette.danger,
    textAlign: "center",
    lineHeight: 21,
  },
  retryBtn: {
    backgroundColor: "transparent",
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryText: {
    fontSize: fontSize.body,
    color: palette.text,
    fontWeight: "700",
  },
});
