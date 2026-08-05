// src/app/__tests__/builder.test.tsx
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import React from "react";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));

const mockListExercises = jest.fn().mockResolvedValue([
  {
    id: "e1",
    name: "Push Up",
    type: "standard",
    source: "exercisedb",
    mediaUrl: null,
    config: {},
  },
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

test("builds a workout from a picked exercise and saves it", async () => {
  const { getByText, getByPlaceholderText } = await render(<Builder />);

  // name the workout
  fireEvent.changeText(getByPlaceholderText("Workout name"), "Morning WOD");

  // pick the exercise from the catalog list -> appends a block
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  await act(async () => {
    fireEvent.press(getByText("Push Up"));
  });

  // save
  await act(async () => {
    fireEvent.press(getByText("Save"));
  });

  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      name: "Morning WOD",
      blocks: [
        {
          exerciseId: "e1",
          workSecs: 30,
          restSecs: 10,
          rounds: 3,
          sets: 1,
          reactionMinSecs: null,
          reactionMaxSecs: null,
        },
      ],
    }),
  );
  expect(mockReplace).toHaveBeenCalledWith("/workouts");
});

test("does not save when the workout has no blocks", async () => {
  const { getByText, getByPlaceholderText } = await render(<Builder />);
  fireEvent.changeText(getByPlaceholderText("Workout name"), "Empty");
  await act(async () => {
    fireEvent.press(getByText("Save"));
  });
  expect(mockCreate).not.toHaveBeenCalled();
});
