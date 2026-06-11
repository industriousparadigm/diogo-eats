// Post-session highlights — the scoreboard's payoff moment.
//
// Renders the API's highlight lines VERBATIM: the beats line always
// leads (it's priority 1 by contract, honest even at zero beats), then
// the 2-3 other generators that fired. No client-side arithmetic.

import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMemo } from "react";
import { useRouter } from "expo-router";
import { palette, radii, borders, fontSize, spacing } from "@/lib/theme";
import { Card, Button } from "@/components/ui";
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
          <Button
            label="Back to strength"
            variant="primary"
            accent={palette.strength.brand}
            onPress={done}
          />
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
          <Card
            identity={palette.strength.brand}
            depth="loud"
            tint={palette.strength.brandSoft}
            style={styles.leadCard}
          >
            <Text style={styles.leadText}>{lead.line}</Text>
          </Card>
        )}

        {rest.map((h) => (
          <Card key={h.id} style={styles.restCard}>
            <Text style={styles.restText}>{h.line}</Text>
          </Card>
        ))}

        {result.session.note && (
          <Text style={styles.note}>“{result.session.note}”</Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Done"
          variant="primary"
          accent={palette.strength.brand}
          size="lg"
          onPress={done}
          accessibilityLabel="done"
        />
      </View>
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
    gap: spacing.lg,
    padding: spacing.xxl,
  },
  missingText: {
    fontSize: fontSize.bodyLg,
    color: palette.textMuted,
  },
  content: {
    padding: spacing.xl,
    gap: spacing.md,
    paddingTop: 36,
    paddingBottom: spacing.xxxl,
  },
  kicker: {
    fontSize: fontSize.caption,
    fontWeight: "800",
    color: palette.strength.brandBright,
    letterSpacing: 2,
  },
  summary: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    marginBottom: spacing.sm,
  },
  leadCard: {
    borderRadius: radii.xl,
    padding: spacing.xl,
  },
  leadText: {
    fontSize: fontSize.display,
    fontWeight: "800",
    color: palette.text,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  restCard: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  restText: {
    fontSize: fontSize.bodyLg,
    color: palette.text,
    lineHeight: 22,
  },
  note: {
    fontSize: fontSize.caption,
    color: palette.textSubtle,
    fontStyle: "italic",
    lineHeight: 19,
    marginTop: spacing.sm,
  },
  footer: {
    padding: spacing.lg,
    paddingBottom: 28,
    borderTopWidth: borders.bold,
    borderTopColor: palette.ink,
  },
});
