import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";

// The repo uses the automatic JSX transform (no `import React`), so the React
// type namespace is not in scope — import the type explicitly.
type IoniconName = ComponentProps<typeof Ionicons>["name"];

function tabIcon(focused: IoniconName, unfocused: IoniconName) {
  return ({ color, size, focused: isFocused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface, borderBottomColor: colors.border },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Padel HIIT", tabBarLabel: "Home", tabBarIcon: tabIcon("home", "home-outline") }}
      />
      <Tabs.Screen
        name="workouts"
        options={{ title: "My workouts", tabBarLabel: "Workouts", tabBarIcon: tabIcon("barbell", "barbell-outline") }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "History", tabBarLabel: "History", tabBarIcon: tabIcon("time", "time-outline") }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: "Exercises", tabBarLabel: "Browse", tabBarIcon: tabIcon("search", "search-outline") }}
      />

      {/* Detail routes: reachable by navigation, absent from the tab bar. */}
      <Tabs.Screen name="builder" options={{ href: null, headerShown: true, title: "New workout" }} />
      <Tabs.Screen
        name="player/[id]"
        options={{ href: null, headerShown: false, tabBarStyle: { display: "none" } }}
      />
    </Tabs>
  );
}
