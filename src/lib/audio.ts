// src/lib/audio.ts
// Thin TTS wrapper. A single utterance at a time: interrupt before speaking so
// step transitions and reaction call-outs never queue up behind each other.
import * as Speech from "expo-speech";

export function speak(text: string): void {
  Speech.stop();
  Speech.speak(text);
}

export function stopSpeaking(): void {
  Speech.stop();
}
