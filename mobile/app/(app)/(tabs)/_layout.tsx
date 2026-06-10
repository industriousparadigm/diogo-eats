// Tab bar: Today (food, default) · Looking back · Strength · Settings.
//
// Food surfaces keep the food green; Strength gets the amber scoreboard
// tint — the two features share a design system but not an emotional
// contract, and the tab bar is the first place that shows.

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { palette, borders } from "@/lib/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: palette.surfaceAlt,
          borderTopColor: palette.ink,
          borderTopWidth: borders.bold,
        },
        tabBarInactiveTintColor: palette.textSubtle,
        sceneStyle: { backgroundColor: palette.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarActiveTintColor: palette.food.accent,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="restaurant" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="overview"
        options={{
          title: "Looking back",
          tabBarActiveTintColor: palette.food.accent,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="strength"
        options={{
          title: "Strength",
          tabBarActiveTintColor: palette.strength.brand,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="barbell" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarActiveTintColor: palette.text,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-sharp" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
