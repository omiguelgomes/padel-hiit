// src/app/(app)/player/[id].tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { getWorkout } from "../../../lib/workouts";
import { flattenWorkout, type WorkoutStep } from "../../../lib/workout-engine";
import { speak, stopSpeaking } from "../../../lib/audio";
import { readPool, pickMove, nextDelayMs, type ReactionMove } from "../../../lib/reaction";

const beep = require("../../../../assets/beep.wav");

function announce(step: WorkoutStep | null): void {
  if (!step) {
    speak("Workout complete");
    return;
  }
  if (step.kind === "rest") speak("Rest");
  else speak(step.exercise.name);
}

export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [steps, setSteps] = useState<WorkoutStep[]>([]);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [call, setCall] = useState<ReactionMove | null>(null);
  const stepsRef = useRef<WorkoutStep[]>([]);
  const beepPlayer = useAudioPlayer(beep);

  // Load the workout, flatten it, and start the first step.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    let active = true;
    getWorkout(id)
      .then((w) => {
        if (!active) return;
        const flat = flattenWorkout(w.blocks);
        stepsRef.current = flat;
        setSteps(flat);
        setRemaining(flat[0]?.durationSecs ?? 0);
        setLoaded(true);
        announce(flat[0] ?? null);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
      stopSpeaking();
    };
  }, [id]);

  const step = steps[index] ?? null;
  const done = loaded && steps.length > 0 && index >= steps.length;

  const goTo = (ni: number) => {
    stopSpeaking();
    setCall(null);
    const ns = stepsRef.current[ni] ?? null;
    setIndex(ni);
    setRemaining(ns ? ns.durationSecs : 0);
    announce(ns);
  };
  const goNext = () => goTo(index + 1);
  const goBack = () => goTo(Math.max(0, index - 1));

  // 1-second countdown while a step is active and not paused.
  useEffect(() => {
    if (paused || done || !loaded || !step) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [paused, done, loaded, step]);

  // Beep in the final 3 seconds; advance when the step hits zero.
  useEffect(() => {
    if (!step) return;
    if (remaining > 0 && remaining <= 3) {
      beepPlayer.seekTo(0);
      beepPlayer.play();
    }
    if (remaining === 0 && loaded) goNext();
    // goNext reads `index` from this render's closure; effect re-runs each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  // Reaction driver: on reaction work steps, fire random call-outs.
  useEffect(() => {
    if (paused || !step || step.kind !== "work" || !step.reaction) return;
    const pool = readPool(step.exercise.config);
    if (pool.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        const move = pickMove(pool);
        if (move) {
          setCall(move);
          if (move.audioUrl == null) speak(move.call); // recorded audio deferred
        }
        schedule();
      }, nextDelayMs(step.reaction!.minSecs, step.reaction!.maxSecs));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [paused, step, index]);

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (done || steps.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700" }}>
          {steps.length === 0 ? "This workout has no steps." : "Workout complete!"}
        </Text>
        <Pressable
          onPress={() => router.replace("/workouts")}
          style={{ backgroundColor: "#222", padding: 14, borderRadius: 8 }}
        >
          <Text style={{ color: "white" }}>Back to workouts</Text>
        </Pressable>
      </View>
    );
  }

  const isRest = step!.kind === "rest";
  const upNext = steps[index + 1] ?? null;
  const animationUrl = call?.mediaUrl ?? (step!.kind === "work" ? step!.exercise.mediaUrl : null);

  return (
    <View style={{ flex: 1, padding: 24, gap: 20, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "600", color: isRest ? "#0891b2" : "#111" }}>
        {isRest ? "Rest" : step!.exercise.name}
      </Text>

      {step!.kind === "work" ? (
        <Text style={{ color: "#666" }}>
          Round {step!.round}/{step!.totalRounds}
          {step!.totalSets > 1 ? ` · Set ${step!.set}/${step!.totalSets}` : ""}
        </Text>
      ) : null}

      {animationUrl ? (
        <Image source={{ uri: animationUrl }} style={{ width: 220, height: 220 }} contentFit="contain" />
      ) : null}

      {call ? <Text style={{ fontSize: 32, fontWeight: "800", color: "#dc2626" }}>{call.call}</Text> : null}

      <Text style={{ fontSize: 64, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{remaining}</Text>

      {upNext ? (
        <Text style={{ color: "#888" }}>
          Up next: {upNext.kind === "rest" ? "Rest" : upNext.exercise.name}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
        <Pressable onPress={goBack} style={{ padding: 12, borderWidth: 1, borderRadius: 8 }}>
          <Text>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => setPaused((p) => !p)}
          style={{ padding: 12, borderWidth: 1, borderRadius: 8, minWidth: 84, alignItems: "center" }}
        >
          <Text>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable onPress={goNext} style={{ padding: 12, borderWidth: 1, borderRadius: 8 }}>
          <Text>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
