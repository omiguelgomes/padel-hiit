import { View, Text, Pressable } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth-context";

export default function Home() {
  const { signOut, session } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
      <Text style={{ fontSize: 20 }}>Logged in as {session?.user.email}</Text>
      <Link href="/library" style={{ fontSize: 16, color: "#2563eb" }}>
        Browse exercises
      </Link>
      <Pressable onPress={signOut} style={{ padding: 12 }}>
        <Text>Log out</Text>
      </Pressable>
    </View>
  );
}
