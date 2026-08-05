import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import React from "react";

const mockSignIn = jest.fn().mockResolvedValue({ error: null });
jest.mock("../../lib/auth-context", () => ({
  useAuth: () => ({ signIn: mockSignIn, signUp: jest.fn(), loading: false, session: null }),
}));

import LoginScreen from "../(auth)/login";

test("submits credentials to signIn", async () => {
  const { getByPlaceholderText, getByText } = await render(<LoginScreen />);
  await act(async () => {
    fireEvent.changeText(getByPlaceholderText("Email"), "a@b.com");
    fireEvent.changeText(getByPlaceholderText("Password"), "secret123");
  });
  fireEvent.press(getByText("Log in"));
  await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith("a@b.com", "secret123"));
});

test("shows a clear error and does not call auth when fields are empty", async () => {
  mockSignIn.mockClear();
  const { getByText } = await render(<LoginScreen />);
  fireEvent.press(getByText("Log in"));
  await waitFor(() => expect(getByText("Enter your email and password.")).toBeTruthy());
  expect(mockSignIn).not.toHaveBeenCalled();
});
