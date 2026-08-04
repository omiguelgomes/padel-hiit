import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import React from "react";

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

import { AuthProvider, useAuth } from "../auth-context";

function Probe() {
  const { loading, session } = useAuth();
  return <Text>{loading ? "loading" : session ? "in" : "out"}</Text>;
}

test("resolves to logged-out state when there is no session", async () => {
  const { getByText } = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(getByText("out")).toBeTruthy());
});
