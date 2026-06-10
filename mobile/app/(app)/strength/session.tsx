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
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, radii, exerciseAccent } from "@/lib/colors";
import { ApiError, completeStrengthSession, fetchStrengthOverview } from "@/lib/api";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draftStorage";
import { exerciseImage } from "@/lib/exerciseImages";
import { fmtSeriesList } from "@/lib/strengthFormat";
import {
  addSeries,
  canConfirmSeries,
  confirmSeries,
  confirmedCount,
  createDraft,
  exerciseDone,
  liveCardOrder,
  setNote,
  setSeriesReps,
  setSeriesWeight,
  toSessionPayload,
  unconfirmSeries,
  type SessionDraft,
} from "@/lib/strengthSession";
import { stashSessionResult } from "@/lib/stores";
import { SeriesRow } from "@/components/SeriesRow";

type View_ = { kind: "picker" } | { kind: "entry"; exerciseId: string };

export default function StrengthSessionScreen() {
  const router = useRouter();
  const [draft, setDraft] = useState<SessionDraft | null>(null);
  const [view, setView] = useState<View_>({ kind: "picker" });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

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
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.centerWrap}>
          {loadError ? (
            <>
              <Text style={styles.errorText}>{loadError}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={boot}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.back()}>
                <Text style={styles.leaveText}>Back</Text>
              </TouchableOpacity>
            </>
          ) : (
            <ActivityIndicator color={colors.strength.brand} />
          )}
        </View>
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

  const order = liveCardOrder(draft);
  const byId = new Map(draft.overview.exercises.map((e) => [e.id, e]));
  const totalConfirmed = confirmedCount(draft);

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

      <ScrollView
        contentContainerStyle={styles.pickerContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.pickerHint}>
          {totalConfirmed === 0
            ? "Pick a machine. Numbers are pre-filled from last time."
            : `${totalConfirmed} set${totalConfirmed === 1 ? "" : "s"} logged`}
        </Text>

        {order.map((id) => {
          const ex = byId.get(id);
          if (!ex) return null;
          const state = draft.overview.states.find((s) => s.exercise_id === id);
          const accent = exerciseAccent(id);
          const done = exerciseDone(draft, id);
          const img = exerciseImage(ex.image_key);
          const confirmed = confirmedCount(draft, id);
          return (
            <TouchableOpacity
              key={id}
              style={[
                styles.pickCard,
                { borderColor: done ? colors.border : accent },
                done && styles.pickCardDone,
              ]}
              onPress={() => setView({ kind: "entry", exerciseId: id })}
              activeOpacity={0.85}
              accessibilityLabel={`${ex.name}${done ? ", logged" : ""}`}
            >
              {img && (
                <Image
                  source={img}
                  style={[styles.pickImage, done && styles.pickImageDone]}
                />
              )}
              <View style={styles.pickBody}>
                <Text
                  style={[
                    styles.pickName,
                    { color: done ? colors.textMuted : accent },
                  ]}
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
              {done && <Text style={[styles.pickCheck, { color: accent }]}>✓</Text>}
            </TouchableOpacity>
          );
        })}

        {/* Optional note — reachable, skippable, never blocking */}
        {noteOpen ? (
          <View style={styles.noteCard}>
            <Text style={styles.noteLabel}>SESSION NOTE</Text>
            <TextInput
              style={styles.noteInput}
              value={draft.note}
              onChangeText={(t) => update((d) => setNote(d, t))}
              placeholder="warmup run, how it felt, anything else..."
              placeholderTextColor={colors.textFaint}
              multiline
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
      </ScrollView>

      {/* Session complete — explicit, sticky */}
      <View style={styles.completeBar}>
        <TouchableOpacity
          style={[
            styles.completeBtn,
            (totalConfirmed === 0 || submitting) && styles.completeBtnDisabled,
          ]}
          onPress={complete}
          disabled={totalConfirmed === 0 || submitting}
          activeOpacity={0.85}
          accessibilityLabel="session complete"
        >
          {submitting ? (
            <ActivityIndicator color={colors.bg} />
          ) : (
            <Text style={styles.completeBtnText}>Session complete</Text>
          )}
        </TouchableOpacity>
      </View>
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
  const accent = exerciseAccent(exerciseId);
  const img = exerciseImage(ex.image_key);
  const confirmed = confirmedCount(draft, exerciseId);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.kav}
      >
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

        <ScrollView
          contentContainerStyle={styles.entryContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.entryHero, { borderColor: accent }]}>
            {img && <Image source={img} style={styles.entryImage} />}
            <Text style={styles.entryDesc}>{ex.description}</Text>
          </View>

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
        </ScrollView>

        <View style={styles.completeBar}>
          <TouchableOpacity
            style={[styles.entryDoneBtn, { backgroundColor: accent }]}
            onPress={onBack}
            activeOpacity={0.85}
            accessibilityLabel="done with this exercise"
          >
            <Text style={styles.completeBtnText}>
              {confirmed > 0
                ? `Done — ${confirmed} set${confirmed === 1 ? "" : "s"} logged`
                : "Back to exercises"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  kav: {
    flex: 1,
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
    borderBottomColor: colors.border,
  },
  headerBtn: {
    minWidth: 56,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBtnText: {
    fontSize: 26,
    color: colors.textMuted,
    lineHeight: 30,
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: 1,
  },
  discardText: {
    fontSize: 12,
    color: colors.textSubtle,
  },
  pickerContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 24,
  },
  pickerHint: {
    fontSize: 12,
    color: colors.textSubtle,
    marginBottom: 2,
  },
  pickCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: 12,
    gap: 12,
  },
  pickCardDone: {
    opacity: 0.75,
    backgroundColor: colors.surfaceAlt,
  },
  pickImage: {
    width: 72,
    height: 52,
    borderRadius: radii.sm,
    backgroundColor: "#fff",
  },
  pickImageDone: {
    opacity: 0.5,
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
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  pickDoneLine: {
    fontSize: 12,
    color: colors.textMuted,
  },
  pickCheck: {
    fontSize: 20,
    fontWeight: "800",
  },
  noteCard: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: 12,
    gap: 8,
    marginTop: 6,
  },
  noteLabel: {
    fontSize: 10,
    color: colors.textSubtle,
    letterSpacing: 1,
  },
  noteInput: {
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    minHeight: 70,
    textAlignVertical: "top",
  },
  noteDoneText: {
    fontSize: 13,
    color: colors.strength.brandBright,
    fontWeight: "600",
    alignSelf: "flex-end",
  },
  noteBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderDashed,
    borderRadius: radii.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  noteBtnText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  submitError: {
    fontSize: 13,
    color: colors.bad,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  completeBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 16,
    paddingBottom: 28,
    backgroundColor: colors.bg,
  },
  completeBtn: {
    backgroundColor: colors.strength.brand,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
  },
  completeBtnDisabled: {
    opacity: 0.35,
  },
  completeBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.bg,
  },
  entryContent: {
    padding: 16,
    gap: 10,
    paddingBottom: 24,
  },
  entryHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderRadius: radii.lg,
    padding: 12,
    marginBottom: 4,
  },
  entryImage: {
    width: 88,
    height: 64,
    borderRadius: radii.sm,
    backgroundColor: "#fff",
  },
  entryDesc: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 18,
  },
  addSeriesBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderDashed,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: "center",
  },
  addSeriesText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  entryDoneBtn: {
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: colors.bad,
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: "600",
  },
  leaveText: {
    fontSize: 13,
    color: colors.textSubtle,
  },
});
