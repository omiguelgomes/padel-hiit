import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "w1" }),
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));
const mockSpeak = jest.fn();
jest.mock("../../lib/audio", () => ({
  speak: (...a: any[]) => mockSpeak(...a),
  stopSpeaking: jest.fn(),
}));

const mockGetWorkout = jest.fn().mockResolvedValue({
  id: "w1",
  name: "Padel HIIT",
  settings: { workSecs: 30, restSecs: 10, sets: 2, reactionMinSecs: null, reactionMaxSecs: null },
  exercises: [
    { id: "e1", name: "Jumping Jacks", type: "standard", mediaUrl: null, config: {} },
    { id: "e2", name: "High Knees", type: "standard", mediaUrl: null, config: {} },
  ],
});
jest.mock("../../lib/workouts", () => ({
  getWorkout: (...a: any[]) => mockGetWorkout(...a),
}));

import Player from "../(app)/player/[id]";

beforeEach(() => jest.clearAllMocks());

test("loads the workout and shows the first work step", async () => {
  const { findByText } = await render(<Player />);
  expect(await findByText("Jumping Jacks")).toBeTruthy();
  // announces the first exercise via TTS
  await waitFor(() => expect(mockSpeak).toHaveBeenCalledWith("Jumping Jacks"));
});

test("Skip advances from the first work step to the rest step", async () => {
  const { findByText, getByText } = await render(<Player />);
  await findByText("Jumping Jacks");
  await act(async () => {
    fireEvent.press(getByText("Skip"));
  });
  // 2 exercises, 2 sets — after the first exercise comes a rest step
  expect(await findByText("Rest")).toBeTruthy();
});
