// Post-session highlights — the scoreboard's payoff moment.
//
// Renders the API's highlight lines VERBATIM: the beats line always
// leads (it's priority 1 by contract, honest even at zero beats), then
// the 2-3 other generators that fired. No client-side arithmetic.

import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo } from "react";
import { useRouter } from "expo-router";
import { colors, radii } from "@/lib/colors";
import { takeSessionResult } from "@/lib/stores";

export default function HighlightsScreen() {
  const router = useRouter();
  const result = useMemo(() => takeSessionResult(), []);

  function done() {
    // Back to the strength tab; its focus effect refetches the overview.
    router.dismissTo("/(app)/(tabs)/strength");
  }

  if (!result) {
    // Cold-opened without a fresh session (shouldn't happen in the flow).
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.centerWrap}>
          <Text style={styles.missingText}>No session to show</Text>
          <TouchableOpacity style={styles.doneBtn} onPress={done}>
            <Text style={styles.doneBtnText}>Back to strength</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const sorted = [...result.highlights].sort((a, b) => a.priority - b.priority);
  const [lead, ...rest] = sorted;
  const exercisesLogged = new Set(result.session.sets.map((s) => s.exercise_id)).size;
  const setsLogged = result.session.sets.length;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.kicker}>SESSION COMPLETE</Text>
        <Text style={styles.summary}>
          {exercisesLogged} exercise{exercisesLogged === 1 ? "" : "s"} ·{" "}
          {setsLogged} set{setsLogged === 1 ? "" : "s"}
        </Text>

        {lead && (
          <View style={styles.leadCard}>
            <Text style={styles.leadText}>{lead.line}</Text>
          </View>
        )}

        {rest.map((h) => (
          <View key={h.id} style={styles.restCard}>
            <Text style={styles.restText}>{h.line}</Text>
          </View>
        ))}

        {result.session.note && (
          <Text style={styles.note}>“{result.session.note}”</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.doneBtn}
          onPress={done}
          activeOpacity={0.85}
          accessibilityLabel="done"
        >
          <Text style={styles.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centerWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  missingText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  content: {
    padding: 20,
    gap: 12,
    paddingTop: 36,
    paddingBottom: 32,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.strength.brandBright,
    letterSpacing: 2,
  },
  summary: {
    fontSize: 13,
    color: colors.textSubtle,
    marginBottom: 8,
  },
  leadCard: {
    backgroundColor: colors.strength.brandDim,
    borderWidth: 2,
    borderColor: colors.strength.brand,
    borderRadius: radii.xl,
    padding: 20,
  },
  leadText: {
    fontSize: 22,
    fontWeight: "800",
    color: colors.text,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  restCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  restText: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  note: {
    fontSize: 13,
    color: colors.textSubtle,
    fontStyle: "italic",
    lineHeight: 19,
    marginTop: 8,
  },
  footer: {
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  doneBtn: {
    backgroundColor: colors.strength.brand,
    borderRadius: radii.lg,
    paddingVertical: 16,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.bg,
  },
});
