import { render, fireEvent, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-image", () => ({ Image: () => null }));

const mockListExercises = jest.fn().mockResolvedValue([
  { id: "e1", name: "Push Up", type: "standard", source: "exercisedb", mediaUrl: "https://x/p.gif", gifUrl: null, config: {} },
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

async function renderPicker(props: any) {
  const utils = await render(<ExercisePicker {...props} />);
  // Flush the FlatList: rows are not queryable until a sync state change lands.
  fireEvent.changeText(utils.getByPlaceholderText("Search exercises"), "push");
  await waitFor(() => expect(utils.getByText("Push Up")).toBeTruthy());
  return utils;
}

test("shows no info button when onPreview is not supplied", async () => {
  const { queryByLabelText } = await renderPicker({ onSelect: jest.fn() });
  expect(queryByLabelText("Preview Push Up")).toBeNull();
});

test("calls onPreview with the exercise when the info button is pressed", async () => {
  const onPreview = jest.fn();
  const { getByLabelText } = await renderPicker({ onSelect: jest.fn(), onPreview });
  fireEvent.press(getByLabelText("Preview Push Up"));
  expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
});

test("the info button stops the press from reaching the row (no accidental add)", async () => {
  const onSelect = jest.fn();
  const onPreview = jest.fn();
  const { getByLabelText } = await renderPicker({ onSelect, onPreview });
  const stopPropagation = jest.fn();
  fireEvent.press(getByLabelText("Preview Push Up"), { stopPropagation });
  expect(stopPropagation).toHaveBeenCalled();
  expect(onPreview).toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

test("row tap still calls onSelect when onPreview is supplied", async () => {
  const onSelect = jest.fn();
  const { getByText } = await renderPicker({ onSelect, onPreview: jest.fn() });
  fireEvent.press(getByText("Push Up"));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
});
