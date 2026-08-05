import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import React from "react";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));

const mockListExercises = jest.fn().mockResolvedValue([
  { id: "e1", name: "Push Up", type: "standard", source: "exercisedb", mediaUrl: null, config: {} },
]);
jest.mock("../../lib/catalog", () => ({
  listExercises: (...a: any[]) => mockListExercises(...a),
}));

const mockCreate = jest.fn().mockResolvedValue("w1");
jest.mock("../../lib/workouts", () => ({
  createWorkout: (...a: any[]) => mockCreate(...a),
}));

import Builder from "../(app)/builder";

beforeEach(() => jest.clearAllMocks());

test("builds a workout with workout-level settings and an exercise slot", async () => {
  const { getByText, getByPlaceholderText } = await render(<Builder />);

  fireEvent.changeText(getByPlaceholderText("Workout name"), "Morning WOD");
  // typing in the picker search flushes the list
  fireEvent.changeText(getByPlaceholderText("Search exercises"), "push");

  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  await act(async () => {
    fireEvent.press(getByText("Push Up"));
  });

  await act(async () => {
    fireEvent.press(getByText("Save"));
  });

  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      name: "Morning WOD",
      workSecs: 30,
      restSecs: 10,
      sets: 1,
      reactionMinSecs: null,
      reactionMaxSecs: null,
      exerciseIds: ["e1"],
    }),
  );
  expect(mockReplace).toHaveBeenCalledWith("/workouts");
});
