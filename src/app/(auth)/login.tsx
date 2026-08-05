import { useState } from "react";
import { View, Text } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { Screen, Card, Button, TextField } from "../../components/ui";
import { colors, spacing, font } from "../../theme";

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (fn: (e: string, p: string) => Promise<{ error: Error | null }>) => {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    const { error } = await fn(email.trim(), password);
    setError(error ? error.message : null);
  };

  return (
    <Screen scroll center>
      <View style={{ alignItems: "center", gap: spacing.xs, marginBottom: spacing.sm }}>
        <Text style={{ fontSize: 34, fontWeight: "800", color: colors.primary }}>Padel HIIT</Text>
        <Text style={font.muted}>Train sharper. Move faster.</Text>
      </View>

      <Card style={{ gap: spacing.md }}>
        <TextField
          placeholder="Email"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextField placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <Button label="Log in" onPress={() => submit(signIn)} />
        <Button label="Create account" variant="ghost" onPress={() => submit(signUp)} />
      </Card>
    </Screen>
  );
}
