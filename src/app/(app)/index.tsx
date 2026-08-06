import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth-context";
import { Screen, ScreenTitle, Card } from "../../components/ui";
import { colors, spacing, font, radius } from "../../theme";

function NavCard({ title, subtitle, onPress }: { title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <Card style={{ gap: spacing.xs }}>
        <Text style={font.h3}>{title}</Text>
        <Text style={font.muted}>{subtitle}</Text>
      </Card>
    </Pressable>
  );
}

export default function Home() {
  const { signOut, session } = useAuth();
  const router = useRouter();
  return (
    <Screen scroll>
      <View style={{ gap: spacing.xs }}>
        <ScreenTitle>Padel HIIT</ScreenTitle>
        <Text style={font.muted}>Logged in as {session?.user.email}</Text>
      </View>

      <NavCard
        title="My workouts"
        subtitle="Build, edit and run your circuits"
        onPress={() => router.push("/workouts")}
      />
      <NavCard
        title="Browse exercises"
        subtitle="Explore the exercise library"
        onPress={() => router.push("/library")}
      />
      <NavCard
        title="History"
        subtitle="Your completed workouts"
        onPress={() => router.push("/history")}
      />

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
