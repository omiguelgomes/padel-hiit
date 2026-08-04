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
    config: {},
  },
]);
jest.mock("../../lib/catalog", () => ({ listExercises: (...a: any[]) => mockListExercises(...a) }));

import Library from "../(app)/library";

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
