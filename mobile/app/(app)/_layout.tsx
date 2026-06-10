// Authenticated shell: a stack hosting the tab bar plus the screens
// that push on top of it (meal edit, strength session, highlights).

import { Stack } from "expo-router";
import { colors } from "@/lib/colors";

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="meal/[id]" />
      <Stack.Screen name="compose" />
      <Stack.Screen name="foods" />
      <Stack.Screen name="strength/session" options={{ gestureEnabled: false }} />
      <Stack.Screen name="strength/highlights" options={{ gestureEnabled: false }} />
      <Stack.Screen name="strength/log/[id]" />
      <Stack.Screen name="strength/exercise/[id]" />
    </Stack>
  );
}
