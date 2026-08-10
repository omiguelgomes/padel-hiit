import { render, fireEvent, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-router", () => ({ Link: ({ children }: any) => children }));

const mockListExercises = jest.fn().mockResolvedValue([
  {
    id: "1",
    name: "Push Up",
    type: "standard",
    source: "exercisedb",
    mediaUrl: "https://cdn.example.com/pushup.gif",
    gifUrl: null,
    config: {},
  },
]);
jest.mock("../../lib/catalog", () => ({
  ...jest.requireActual("../../lib/catalog"),
  listExercises: (...a: any[]) => mockListExercises(...a),
}));
jest.mock("../../lib/supabase", () => ({ supabase: {} }));

import Library from "../(app)/library";

beforeEach(() => mockListExercises.mockClear());

test("lists exercises returned by the catalog", async () => {
  const { getByText } = await render(<Library />);
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
});

test("re-queries the catalog when the search text changes", async () => {
  const { getByPlaceholderText } = await render(<Library />);
  fireEvent.changeText(getByPlaceholderText("Search exercises"), "squat");
  await waitFor(() =>
    expect(mockListExercises).toHaveBeenCalledWith({ search: "squat" }),
  );
});

test("tapping an exercise row opens its preview", async () => {
  const { getByText, queryByLabelText, findByLabelText } = await render(<Library />);
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  expect(queryByLabelText("Close preview")).toBeNull();
  fireEvent.press(getByText("Push Up"));
  expect(await findByLabelText("Close preview")).toBeTruthy();
});

test("the info button also opens the preview", async () => {
  const { getByText, getByLabelText, findByLabelText } = await render(<Library />);
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  fireEvent.press(getByLabelText("Preview Push Up"));
  expect(await findByLabelText("Close preview")).toBeTruthy();
});
