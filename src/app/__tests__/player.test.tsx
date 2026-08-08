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
    { id: "e1", name: "Jumping Jacks", type: "standard", mediaUrl: null, gifUrl: null, config: {} },
    { id: "e2", name: "High Knees", type: "standard", mediaUrl: null, gifUrl: null, config: {} },
  ],
});
jest.mock("../../lib/workouts", () => ({
  getWorkout: (...a: any[]) => mockGetWorkout(...a),
  toSnapshot: (w: any) => ({ version: 1, name: w.name, settings: w.settings, exercises: w.exercises }),
}));
jest.mock("../../lib/run-session", () => ({ takePendingRun: () => null }));
jest.mock("../../lib/history", () => ({ recordCompletion: jest.fn(() => Promise.resolve()) }));

import Player from "../(app)/player/[id]";

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.useRealTimers());

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

test("on a reaction call-out, speaks a direction and flashes the court", async () => {
  jest.useFakeTimers();
  mockGetWorkout.mockResolvedValueOnce({
    id: "w1",
    name: "Reaction WOD",
    settings: { workSecs: 30, restSecs: 0, sets: 1, reactionMinSecs: 2, reactionMaxSecs: 2 },
    exercises: [
      {
        id: "r1",
        name: "Volley",
        type: "reaction",
        mediaUrl: null,
        gifUrl: null,
        config: { pool: [{ call: "Volley", media_url: null, audio_url: null }] },
      },
    ],
  });

  const { findByText, getByTestId, queryByTestId } = await render(<Player />);
  await findByText("Volley");

  // advance past the 2s call-out interval
  await act(async () => {
    jest.advanceTimersByTime(2100);
  });

  // a direction was spoken (one of the three)
  const spokenWithDirection = mockSpeak.mock.calls
    .flat()
    .some((arg) => ["left", "center", "right"].includes(arg));
  expect(spokenWithDirection).toBe(true);

  // the court flash rendered
  expect(getByTestId("court-flash")).toBeTruthy();

  // flash clears after ~1s
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(queryByTestId("court-flash")).toBeNull();
});
