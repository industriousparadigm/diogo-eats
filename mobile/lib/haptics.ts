// Haptics — thin, platform-guarded wrapper over expo-haptics.
//
// The strength flow is a physical, eyes-down, gym-floor interaction;
// haptics make confirmations feel real without looking at the screen.
// expo-haptics is a no-op on web (no Vibration API guarantee), so every
// call is guarded by Platform.OS and wrapped so a failure never throws
// into the UI. Three intents, mapped to the spec:
//
//   tapConfirm()   light impact   — a set is confirmed
//   sessionDone()  success notif  — a session completes
//   beatBuzz()     a distinct heavier double-tap — highlights have ≥1 beat
//
// Keep this the ONLY place that imports expo-haptics, so the guard lives
// in one spot and screens just call intents.

import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const enabled = Platform.OS === "ios" || Platform.OS === "android";

export function tapConfirm(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function sessionDone(): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

// A distinct "you beat a number" buzz: a success notification immediately
// followed by a medium impact, so it reads heavier than a plain complete.
export function beatBuzz(): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  setTimeout(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  }, 120);
}
