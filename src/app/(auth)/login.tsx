import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useAuth } from "../../lib/auth-context";

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
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Padel HIIT</Text>
      <TextInput placeholder="Email" autoCapitalize="none" value={email}
        onChangeText={setEmail} style={{ borderWidth: 1, padding: 12, borderRadius: 8 }} />
      <TextInput placeholder="Password" secureTextEntry value={password}
        onChangeText={setPassword} style={{ borderWidth: 1, padding: 12, borderRadius: 8 }} />
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Pressable onPress={() => submit(signIn)} style={{ backgroundColor: "#222", padding: 14, borderRadius: 8 }}>
        <Text style={{ color: "white", textAlign: "center" }}>Log in</Text>
      </Pressable>
      <Pressable onPress={() => submit(signUp)} style={{ padding: 14 }}>
        <Text style={{ textAlign: "center" }}>Create account</Text>
      </Pressable>
    </View>
  );
}
