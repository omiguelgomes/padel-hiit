import { render, fireEvent, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-image", () => ({ Image: () => null }));

const mockListExercises = jest.fn().mockResolvedValue([
  { id: "e1", name: "Push Up", type: "standard", source: "exercisedb", mediaUrl: "https://x/p.gif", config: {} },
]);
jest.mock("../../lib/catalog", () => ({
  listExercises: (...a: any[]) => mockListExercises(...a),
}));

import ExercisePicker from "../ExercisePicker";

beforeEach(() => jest.clearAllMocks());

test("lists exercises and calls onSelect when a row is pressed", async () => {
  const onSelect = jest.fn();
  const { getByText, getByPlaceholderText } = await render(
    <ExercisePicker onSelect={onSelect} />,
  );
  // trigger the search state so the list flushes
  fireEvent.changeText(getByPlaceholderText("Search exercises"), "push");
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  fireEvent.press(getByText("Push Up"));
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ id: "e1", name: "Push Up" }),
  );
});
