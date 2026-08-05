const mockStop = jest.fn();
const mockSpeak = jest.fn();
jest.mock("expo-speech", () => ({
  stop: (...a: any[]) => mockStop(...a),
  speak: (...a: any[]) => mockSpeak(...a),
}));

import { speak, stopSpeaking } from "../audio";

beforeEach(() => jest.clearAllMocks());

test("speak interrupts current speech then speaks the text", () => {
  speak("Rest");
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(mockSpeak).toHaveBeenCalledWith("Rest");
  // stop is called before speak
  expect(mockStop.mock.invocationCallOrder[0]).toBeLessThan(
    mockSpeak.mock.invocationCallOrder[0],
  );
});

test("stopSpeaking stops speech", () => {
  stopSpeaking();
  expect(mockStop).toHaveBeenCalledTimes(1);
});
