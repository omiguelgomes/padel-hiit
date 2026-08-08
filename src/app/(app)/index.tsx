import { View, Text, Pressable } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { Screen } from "../../components/ui";
import { colors, spacing, font, radius } from "../../theme";

export default function Home() {
  const { signOut, session } = useAuth();
  return (
    <Screen scroll>
      <View style={{ gap: spacing.xs }}>
        <Text style={font.muted}>Logged in as {session?.user.email}</Text>
      </View>

      <Pressable
        onPress={signOut}
        style={({ pressed }) => ({
          padding: spacing.md,
          borderRadius: radius.md,
          alignItems: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Log out</Text>
      </Pressable>
    </Screen>
  );
}
