// Live strength session — the gym-floor capture flow (spec 6.2).
//
// One route owns the whole flow: exercise picker <-> per-series entry,
// optional note, explicit Session complete. The draft is a pure state
// machine (lib/strengthSession) persisted to AsyncStorage on EVERY
// change, so backgrounding between machines or an app kill never loses
// a set. The server only sees the completed session, in one POST.
//
// Startup order: resume an existing draft if one exists; otherwise
// fetch the overview and start fresh. Once a draft exists the screen
// never needs the network again until Session complete.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { palette, radii, borders, fontSize, spacing, exerciseIdentity } from "@/lib/theme";
import { Card, Button, Input, SectionHeader, KeyboardAwareScrollView } from "@/components/ui";
import { SessionPickerSkeleton } from "@/components/skeletons/SessionPickerSkeleton";
import { ApiError, completeStrengthSession, fetchStrengthOverview } from "@/lib/api";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draftStorage";
import { ExerciseImage } from "@/components/ExerciseImage";
import { fmtSeriesList } from "@/lib/strengthFormat";
import {
  addExerciseToDraft,
  addSeries,
  canConfirmSeries,
  confirmSeries,
  confirmedCount,
  createDraft,
  exerciseDone,
  setNote,
  setSeriesReps,
  setSeriesWeight,
  toSessionPayload,
  unconfirmSeries,
  type SessionDraft,
} from "@/lib/strengthSession";
import { filterByName, pickerZones } from "@/lib/pickerZones";
import { AddExerciseForm } from "@/components/AddExerciseForm";
import { AlternativesSheet } from "@/components/AlternativesSheet";
import { stashSessionResult } from "@/lib/stores";
import { beatBuzz, sessionDone } from "@/lib/haptics";
import { SeriesRow } from "@/components/SeriesRow";
import type { Exercise } from "@/lib/strengthTypes";

type View_ = { kind: "picker" } | { kind: "entry"; exerciseId: string };

export default function StrengthSessionScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [view, setView] = useState<View_>({ kind: "picker" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // Picker overhaul state: the everything-else search query, the "+ new
  // exercise" form toggle, and the exercise whose alternatives sheet is open.
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [altsFor, setAltsFor] = useState<Exercise | null>(null);

  // ---- startup: resume or create ----
  const boot = useCallback(async () => {
    setLoadError(null);
    const existing = await loadDraft();
    if (existing) {
      setDraft(existing);
      return;
    }
    try {
      const overview = await fetchStrengthOverview();
      const fresh = createDraft(overview, Date.now());
      setDraft(fresh);
      saveDraft(fresh);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Could not start a session"
      );
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  // ---- persist on every draft change ----
  const bootedRef = useRef(false);
  useEffect(() => {
    if (!draft) return;
    if (!bootedRef.current) {
      bootedRef.current = true;
      return; // initial set was already persisted (or came from storage)
    }
    saveDraft(draft);
  }, [draft]);

  function update(fn: (d: SessionDraft) => SessionDraft) {
    setDraft((d) => (d ? fn(d) : d));
  }

  // ---- picker actions (zones, add-new, alternatives) ----

  // A freshly created (or "use that one") exercise: inject it into the
  // draft, close any open add-form/alts sheet, and jump straight into its
  // entry so logging it is the very next thing. Idempotent in the draft, so
  // a "use that one" on an exercise already in the catalog just opens it.
  function handleCreated(exercise: Exercise) {
    update((d) => addExerciseToDraft(d, exercise));
    setAddOpen(false);
    setSearch("");
    setAltsFor(null);
    setView({ kind: "entry", exerciseId: exercise.id });
  }

  // Picked a catalog alternative from the sheet → open its entry.
  function pickAlternative(exerciseId: string) {
    setAltsFor(null);
    setView({ kind: "entry", exerciseId });
  }

  // ---- leaving / discarding ----
  function leave() {
    if (!draft || confirmedCount(draft) === 0) {
      // Nothing logged: leaving abandons the empty session.
      clearDraft();
      router.back();
      return;
    }
    // Sets are logged: leaving keeps the draft (resume from overview).
    router.back();
  }

  function discard() {
    Alert.alert("Discard session?", "Logged sets on this phone will be lost.", [
      { text: "Keep logging", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          await clearDraft();
          router.back();
        },
      },
    ]);
  }

  // ---- completion ----
  async function complete() {
    if (!draft) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = toSessionPayload(draft, Date.now());
      const result = await completeStrengthSession(payload);
      await clearDraft();
      // Success haptic — and a distinct heavier buzz when at least one
      // number was beaten (the beats highlight is priority 1, leads).
      const beats = result.highlights.find((h) => h.id === "beats")?.beats ?? [];
      if (beats.length > 0) {
        beatBuzz();
      } else {
        sessionDone();
      }
      stashSessionResult(result);
      router.replace("/(app)/strength/highlights");
    } catch (err) {
      setSubmitError(
        err instanceof ApiError && err.code === "NETWORK_ERROR"
          ? "No network — the session is saved on this phone. Retry when you're back online."
          : err instanceof ApiError
            ? err.message
            : "Could not save the session"
      );
      setSubmitting(false);
    }
  }

  // ---- render ----
  if (!draft) {
    // Booting: a fresh draft is being built from the overview fetch. Show
    // the SESSION header + a skeleton picker (loud register) so the flow
    // never opens on a bare spinner. The error path stays centered.
    if (loadError) {
      return (
        <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
          <View style={styles.centerWrap}>
            <Text style={styles.errorText}>{loadError}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={boot}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.leaveText}>Back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerBtn}
            accessibilityLabel="leave session"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerBtnText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SESSION</Text>
          <View style={styles.headerBtn} />
        </View>
        <ScrollView contentContainerStyle={styles.pickerContent} showsVerticalScrollIndicator={false}>
          <SessionPickerSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (view.kind === "entry") {
    return (
      <EntryView
        draft={draft}
        exerciseId={view.exerciseId}
        onBack={() => setView({ kind: "picker" })}
        update={update}
      />
    );
  }

  // `draft` is non-null past the boot guard above; bind a narrowed local so
  // the closures below (renderPickCard) keep the narrowing.
  const activeDraft = draft;
  const zones = pickerZones(activeDraft);
  const byId = new Map(activeDraft.overview.exercises.map((e) => [e.id, e]));
  const totalConfirmed = confirmedCount(activeDraft);
  // The everything-else zone is searchable; only the filtered subset shows.
  const everythingElse = filterByName(activeDraft, zones.everythingElse, search);

  // One picker card. Pulled out so both zones render identical cards (the
  // only zone difference is the section header above them, plus the alts
  // affordance that every card carries).
  function renderPickCard(id: string) {
    const ex = byId.get(id);
    if (!ex) return null;
    const state = activeDraft.overview.states.find((s) => s.exercise_id === id);
    const accent = exerciseIdentity(id).accent;
    const done = exerciseDone(activeDraft, id);
    const confirmed = confirmedCount(activeDraft, id);
    return (
      <Card
        key={id}
        identity={done ? palette.ink : accent}
        depth="loud"
        dimmed={done}
        tone={done ? "recessed" : "raised"}
        style={styles.pickCard}
        onPress={() => setView({ kind: "entry", exerciseId: id })}
        accessibilityLabel={`${ex.name}${done ? ", logged" : ""}`}
      >
        <ExerciseImage imageKey={ex.image_key} style={styles.pickImage} dimmed={done} />
        <View style={styles.pickBody}>
          <Text
            style={[styles.pickName, { color: done ? palette.textMuted : accent }]}
          >
            {ex.name}
          </Text>
          {done ? (
            <Text style={styles.pickDoneLine}>
              ✓ {confirmed} set{confirmed === 1 ? "" : "s"} logged
            </Text>
          ) : state?.prefill.never_done ? (
            <Text style={styles.pickLast}>first time — defaults ready</Text>
          ) : (
            <Text style={styles.pickLast}>
              last: {fmtSeriesList(state?.prefill.series ?? [], ex.measurement_type)}
            </Text>
          )}
        </View>
        {/* "alts" — a small, discoverable affordance on every card. The
            owner's seated row was taken with no way out; this is the way
            out. Stops the card press from bubbling so a tap opens the
            sheet, not the entry. */}
        {!done && (
          <TouchableOpacity
            onPress={() => setAltsFor(ex)}
            style={styles.altsBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`${ex.name} alternatives`}
          >
            <Text style={[styles.altsText, { color: accent }]}>alts</Text>
          </TouchableOpacity>
        )}
        {done && <Text style={[styles.pickCheck, { color: accent }]}>✓</Text>}
      </Card>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={leave}
          style={styles.headerBtn}
          accessibilityLabel="leave session"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SESSION</Text>
        <TouchableOpacity
          onPress={discard}
          style={styles.headerBtn}
          accessibilityLabel="discard session"
        >
          <Text style={styles.discardText}>discard</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.pickerContent}
        footer={
          /* Session complete — explicit, sticky. Hidden by the aware scroll
             while the keyboard is up so it never covers the focused note. */
          <View style={styles.completeBar}>
            <Button
              label="Session complete"
              variant="primary"
              accent={palette.strength.brand}
              size="lg"
              loading={submitting}
              disabled={totalConfirmed === 0 || submitting}
              onPress={complete}
              accessibilityLabel="session complete"
            />
          </View>
        }
      >
        <Text style={styles.pickerHint}>
          {totalConfirmed === 0
            ? "Pick a machine. Numbers are pre-filled from last time."
            : `${totalConfirmed} set${totalConfirmed === 1 ? "" : "s"} logged`}
        </Text>

        {/* YOUR USUAL — the exercises you actually train, most-likely-next
            order. This is the pre-overhaul picker, now named. */}
        {zones.usual.length > 0 && (
          <>
            <SectionHeader color={palette.strength.brand} style={styles.zoneHeader}>
              YOUR USUAL
            </SectionHeader>
            {zones.usual.map(renderPickCard)}
          </>
        )}

        {/* EVERYTHING ELSE — the rest of the catalog, searchable. Only
            rendered when there's anything beyond your usual to show. */}
        {zones.everythingElse.length > 0 && (
          <>
            <SectionHeader style={styles.zoneHeader}>EVERYTHING ELSE</SectionHeader>
            <Input
              value={search}
              onChangeText={setSearch}
              accent={palette.strength.brand}
              placeholder="search exercises..."
              autoCapitalize="none"
              accessibilityLabel="search exercises"
              style={styles.searchField}
            />
            {everythingElse.length > 0 ? (
              everythingElse.map(renderPickCard)
            ) : (
              <Text style={styles.searchEmpty}>
                Nothing matches “{search.trim()}”. Add it below.
              </Text>
            )}
          </>
        )}

        {/* + new exercise — always here, bottom of the picker. The way out
            of the owner's failure: improvise an exercise and log it now. */}
        {addOpen ? (
          <AddExerciseForm onCreated={handleCreated} onCancel={() => setAddOpen(false)} />
        ) : (
          <TouchableOpacity
            style={styles.addExerciseBtn}
            onPress={() => setAddOpen(true)}
            accessibilityLabel="add a new exercise"
          >
            <Text style={styles.addExerciseText}>+ new exercise</Text>
          </TouchableOpacity>
        )}

        {/* Optional note — reachable, skippable, never blocking */}
        {noteOpen ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>SESSION NOTE</Text>
            <Input
              variant="multiline"
              accent={palette.strength.brand}
              value={draft.note}
              onChangeText={(t) => update((d) => setNote(d, t))}
              placeholder="warmup run, how it felt, anything else..."
              maxLength={2000}
              autoFocus
              accessibilityLabel="session note"
            />
            <TouchableOpacity onPress={() => setNoteOpen(false)}>
              <Text style={styles.noteDoneText}>done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.noteBtn} onPress={() => setNoteOpen(true)}>
            <Text style={styles.noteBtnText}>
              {draft.note.trim() ? `note: ${draft.note.trim()}` : "+ add a note (optional)"}
            </Text>
          </TouchableOpacity>
        )}

        {submitError && <Text style={styles.submitError}>{submitError}</Text>}
      </KeyboardAwareScrollView>

      {/* "Machine taken?" sheet — opened from any card's alts affordance. */}
      <AlternativesSheet
        visible={altsFor !== null}
        exercise={altsFor}
        catalogById={byId}
        onClose={() => setAltsFor(null)}
        onPickExisting={pickAlternative}
        onCreated={handleCreated}
      />
    </SafeAreaView>
  );
}

// ---- per-exercise entry ----

function EntryView({
  draft,
  exerciseId,
  onBack,
  update,
}: {
  draft: SessionDraft;
  exerciseId: string;
  onBack: () => void;
  update: (fn: (d: SessionDraft) => SessionDraft) => void;
}) {
  const ex = draft.overview.exercises.find((e) => e.id === exerciseId);
  const entry = draft.entries[exerciseId];
  // Defensive: an unknown exercise just renders nothing (shouldn't happen —
  // entries are created for every catalog exercise at draft creation).
  if (!ex || !entry) return null;
  const accent = exerciseIdentity(exerciseId).accent;
  const confirmed = confirmedCount(draft, exerciseId);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.headerBtn}
          accessibilityLabel="back to exercises"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.headerBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: accent }]}>
          {ex.name.toUpperCase()}
        </Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.entryContent}
        footer={
          <View style={styles.completeBar}>
            <Button
              label={
                confirmed > 0
                  ? `Done — ${confirmed} set${confirmed === 1 ? "" : "s"} logged`
                  : "Back to exercises"
              }
              variant="primary"
              accent={accent}
              size="lg"
              onPress={onBack}
              accessibilityLabel="done with this exercise"
            />
          </View>
        }
      >
        <Card identity={accent} depth="loud" style={styles.entryHero}>
          <ExerciseImage imageKey={ex.image_key} style={styles.entryImage} />
          <Text style={styles.entryDesc}>
            {ex.description?.trim() || "Your exercise — log the numbers below."}
          </Text>
        </Card>

        {entry.series.map((s, i) => (
          <SeriesRow
            key={i}
            index={i}
            series={s}
            type={ex.measurement_type}
            accent={accent}
            canConfirm={canConfirmSeries(draft, exerciseId, i)}
            onWeight={(w) => update((d) => setSeriesWeight(d, exerciseId, i, w))}
            onReps={(r) => update((d) => setSeriesReps(d, exerciseId, i, r))}
            onConfirm={() => update((d) => confirmSeries(d, exerciseId, i))}
            onUnconfirm={() => update((d) => unconfirmSeries(d, exerciseId, i))}
          />
        ))}

        <TouchableOpacity
          style={styles.addSeriesBtn}
          onPress={() => update((d) => addSeries(d, exerciseId))}
          accessibilityLabel="add series"
        >
          <Text style={styles.addSeriesText}>+ add series</Text>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.ink,
  },
  headerBtn: {
    minWidth: 56,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnText: {
    fontSize: 26,
    color: palette.textMuted,
    lineHeight: 30,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: palette.text,
    letterSpacing: 1,
  },
  discardText: {
    fontSize: 12,
    color: palette.textSubtle,
  },
  pickerContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 24,
  },
  pickerHint: {
    fontSize: 12,
    color: palette.textSubtle,
    marginBottom: 2,
  },
  zoneHeader: {
    marginTop: spacing.sm,
  },
  searchField: {
    marginBottom: spacing.xs,
  },
  searchEmpty: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    paddingVertical: spacing.sm,
  },
  addExerciseBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.borderDashed,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.xs,
  },
  addExerciseText: {
    fontSize: fontSize.body,
    color: palette.strength.brandBright,
    fontWeight: "700",
  },
  pickCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    gap: spacing.md,
  },
  pickImage: {
    width: 72,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: palette.white,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  altsBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: borders.hairline,
    borderColor: palette.inkSoft,
    borderRadius: radii.sm,
  },
  altsText: {
    fontSize: fontSize.tiny,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  pickBody: {
    flex: 1,
    gap: 3,
  },
  pickName: {
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  pickLast: {
    fontSize: 12,
    color: palette.textMuted,
    fontVariant: ["tabular-nums"],
  },
  pickDoneLine: {
    fontSize: 12,
    color: palette.textMuted,
  },
  pickCheck: {
    fontSize: 20,
    fontWeight: "800",
  },
  noteCard: {
    backgroundColor: palette.surfaceAlt,
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  noteLabel: {
    fontSize: fontSize.tiny,
    color: palette.textSubtle,
    letterSpacing: 1,
    fontWeight: "700",
  },
  noteDoneText: {
    fontSize: 13,
    color: palette.strength.brandBright,
    fontWeight: "600",
    alignSelf: "flex-end",
  },
  noteBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.borderDashed,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  noteBtnText: {
    fontSize: 13,
    color: palette.textMuted,
  },
  submitError: {
    fontSize: 13,
    color: palette.danger,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  completeBar: {
    borderTopWidth: borders.bold,
    borderTopColor: palette.ink,
    padding: spacing.lg,
    paddingBottom: 28,
    backgroundColor: palette.bg,
  },
  entryContent: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  entryHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  entryImage: {
    width: 88,
    height: 64,
    borderRadius: radii.sm,
    backgroundColor: palette.white,
    borderWidth: borders.bold,
    borderColor: palette.ink,
  },
  entryDesc: {
    flex: 1,
    fontSize: 12,
    color: palette.textMuted,
    lineHeight: 18,
  },
  addSeriesBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.borderDashed,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  addSeriesText: {
    fontSize: 13,
    color: palette.textMuted,
  },
  errorText: {
    fontSize: 14,
    color: palette.danger,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "transparent",
    borderWidth: borders.bold,
    borderColor: palette.ink,
    borderRadius: radii.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 14,
    color: palette.text,
    fontWeight: "600",
  },
  leaveText: {
    fontSize: 13,
    color: palette.textSubtle,
  },
});
