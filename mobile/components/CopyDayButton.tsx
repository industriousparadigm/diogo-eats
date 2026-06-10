// "copy day" affordance for the Today header. One tap puts a markdown
// summary of the day on the clipboard, ready to paste into Claude /
// ChatGPT / Obsidian / etc. Brief visual confirm, then back to idle.
//
// Native sibling of the web's CopyDayButton — same formatter (the ported
// lib/dayReport.formatDayReport), expo-clipboard for the write.

import { useRef, useState } from "react";
import { Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Clipboard from "expo-clipboard";
import { colors } from "@/lib/colors";
import { formatDayReport } from "@/lib/dayReport";
import type { Meal } from "@/lib/types";

type Props = {
  meals: Meal[];
  // The day being viewed, YYYY-MM-DD.
  ymd: string;
};

export function CopyDayButton({ meals, ymd }: Props) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function onCopy() {
    const [y, mo, d] = ymd.split("-").map(Number);
    const date = new Date(y, mo - 1, d);
    const text = formatDayReport(meals, date);
    try {
      await Clipboard.setStringAsync(text);
      setState("copied");
    } catch {
      setState("failed");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1800);
  }

  const label = state === "copied" ? "copied ✓" : state === "failed" ? "failed" : "copy day";

  return (
    <TouchableOpacity
      onPress={onCopy}
      accessibilityLabel="copy day report"
      style={[
        styles.btn,
        state === "copied" && styles.btnCopied,
        state === "failed" && styles.btnFailed,
      ]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text
        style={[
          styles.text,
          state === "copied" && styles.textCopied,
          state === "failed" && styles.textFailed,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  btnCopied: {
    borderColor: colors.accent,
  },
  btnFailed: {
    borderColor: colors.bad,
  },
  text: {
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: "500",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  textCopied: {
    color: colors.accentBright,
  },
  textFailed: {
    color: colors.bad,
  },
});
