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
import { Button } from "../../../components/ui";
import { colors, spacing, radius } from "../../../theme";

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
        const flat = flattenWorkout(w.exercises, w.settings);
        stepsRef.current = flat;
        setSteps(flat);
        setRemaining(flat[0]?.durationSecs ?? 0);
        setLoaded(true);
        if (flat.length > 0) announce(flat[0]);
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <Text style={{ fontSize: 18, color: colors.textMuted }}>Loading…</Text>
      </View>
    );
  }

  if (done || steps.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: spacing.xl,
          padding: spacing.xl,
          backgroundColor: colors.bg,
        }}
      >
        <Text style={{ fontSize: 28, fontWeight: "800", color: colors.text, textAlign: "center" }}>
          {steps.length === 0 ? "This workout has no steps." : "Workout complete!"}
        </Text>
        <Button
          label="Back to workouts"
          onPress={() => router.replace("/workouts")}
          style={{ minWidth: 220 }}
        />
      </View>
    );
  }

  const isRest = step!.kind === "rest";
  const upNext = steps[index + 1] ?? null;
  const animationUrl = call?.mediaUrl ?? (step!.kind === "work" ? step!.exercise.mediaUrl : null);

  // Immersive full-bleed background that signals work vs. rest at a glance.
  const bg = isRest ? colors.rest : colors.primary;
  const onBg = colors.onPrimary;

  return (
    <View
      style={{
        flex: 1,
        padding: spacing.xl,
        gap: spacing.lg,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
      }}
    >
      <Text style={{ fontSize: 26, fontWeight: "700", color: onBg, textAlign: "center" }}>
        {isRest ? "Rest" : step!.exercise.name}
      </Text>

      {step!.kind === "work" && step!.totalSets > 1 ? (
        <Text style={{ color: onBg, opacity: 0.85, fontWeight: "600" }}>
          Set {step!.set}/{step!.totalSets}
        </Text>
      ) : null}

      {animationUrl ? (
        <Image
          source={{ uri: animationUrl }}
          style={{ width: 240, height: 240, borderRadius: radius.lg, backgroundColor: "rgba(255,255,255,0.15)" }}
          contentFit="contain"
        />
      ) : null}

      {call ? (
        <Text style={{ fontSize: 40, fontWeight: "800", color: onBg, letterSpacing: 1 }}>{call.call}</Text>
      ) : null}

      <Text style={{ fontSize: 88, fontWeight: "800", color: onBg, fontVariant: ["tabular-nums"] }}>
        {remaining}
      </Text>

      {upNext ? (
        <Text style={{ color: onBg, opacity: 0.8 }}>
          Up next: {upNext.kind === "rest" ? "Rest" : upNext.exercise.name}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
        <ControlButton label="Back" onPress={goBack} />
        <ControlButton label={paused ? "Resume" : "Pause"} onPress={() => setPaused((p) => !p)} wide />
        <ControlButton label="Skip" onPress={goNext} />
      </View>
    </View>
  );
}

function ControlButton({ label, onPress, wide }: { label: string; onPress: () => void; wide?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 12,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.pill,
        backgroundColor: pressed ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)",
        minWidth: wide ? 100 : 72,
        alignItems: "center",
      })}
    >
      <Text style={{ color: colors.onPrimary, fontWeight: "700" }}>{label}</Text>
    </Pressable>
  );
}
