import { render, fireEvent, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-router", () => ({
  Link: ({ children }: any) => children,
  useFocusEffect: (cb: any) => require("react").useEffect(cb, []),
}));

const mockList = jest.fn();
const mockDelete = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/workouts", () => ({
  listWorkouts: (...a: any[]) => mockList(...a),
  deleteWorkout: (...a: any[]) => mockDelete(...a),
}));

import Workouts from "../(app)/workouts";

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([
    { id: "w1", name: "Padel HIIT", createdAt: "2026-08-05T00:00:00Z" },
  ]);
});

test("shows saved workouts", async () => {
  const { getByText } = await render(<Workouts />);
  await waitFor(() => expect(getByText("Padel HIIT")).toBeTruthy());
});

test("deletes a workout and refreshes the list", async () => {
  const { getByText, getAllByText } = await render(<Workouts />);
  await waitFor(() => expect(getByText("Padel HIIT")).toBeTruthy());
  fireEvent.press(getAllByText("Delete")[0]);
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("w1"));
  // list is re-fetched after delete (once on focus, once after delete)
  expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(2);
});
