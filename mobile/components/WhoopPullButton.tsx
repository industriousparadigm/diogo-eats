// WhoopPullButton — the self-serve "pull my Whoop data" action, at the bottom
// of the Movement tab. Taps the backend's sync+import: refreshes whoop_workouts
// from Whoop, then ADDS any workouts we don't have as activities and ENRICHES
// matching manual ones with strain. Reports the result inline; refetches the
// landing on a change so the new activities show immediately.

import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { palette, fontSize, spacing } from "@/lib/theme";
import { Button } from "@/components/ui";
import { ApiError, pullFromWhoop } from "@/lib/api";

export function WhoopPullButton({ onPulled }: { onPulled: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function pull() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await pullFromWhoop();
      const parts: string[] = [];
      if (r.added) parts.push(`+${r.added} new`);
      if (r.enriched) parts.push(`${r.enriched} updated`);
      const pulled = parts.length ? `Pulled · ${parts.join(" · ")}` : null;
      if (r.syncStatus !== "ok") {
        // The Whoop sync itself failed (token expired / refresh rejected). We
        // may still have imported over already-synced data, but new days
        // need a reconnect.
        setMsg(pulled ? `${pulled} · reconnect Whoop in Settings` : "Whoop needs reconnecting in Settings.");
      } else {
        setMsg(pulled ?? "Already up to date");
      }
      if (r.added || r.enriched) onPulled();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "Couldn't reach Whoop");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Button
        label={busy ? "Pulling from Whoop…" : "⟳ Pull from Whoop"}
        variant="secondary"
        accent={palette.strength.brand}
        onPress={pull}
        disabled={busy}
        accessibilityLabel="pull from whoop"
      />
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginTop: spacing.sm },
  msg: { fontSize: fontSize.caption, color: palette.textMuted, textAlign: "center" },
});
