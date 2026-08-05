// src/app/(app)/builder.tsx
import { useState, useRef } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { type CatalogExercise } from "../../lib/catalog";
import { createWorkout } from "../../lib/workouts";
import {
  flattenWorkout,
  totalDurationSecs,
  type EngineExercise,
  type WorkoutSettings,
} from "../../lib/workout-engine";
import ExercisePicker from "../../components/ExercisePicker";

export default function Builder() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workSecs, setWorkSecs] = useState(30);
  const [restSecs, setRestSecs] = useState(10);
  const [sets, setSets] = useState(1);
  const [reactionMin, setReactionMin] = useState(2);
  const [reactionMax, setReactionMax] = useState(5);
  const [exercises, setExercises] = useState<CatalogExercise[]>([]);
  // Ref mirrors exercises state — save() reads the ref directly to avoid a stale
  // closure under React 19 + @testing-library/react-native v14 async-act flushing.
  const exercisesRef = useRef<CatalogExercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  const add = (ex: CatalogExercise) => {
    exercisesRef.current = [...exercisesRef.current, ex];
    setExercises(exercisesRef.current);
  };
  const remove = (i: number) => {
    exercisesRef.current = exercisesRef.current.filter((_, j) => j !== i);
    setExercises(exercisesRef.current);
  };
  const move = (i: number, dir: -1 | 1) => {
    const xs = exercisesRef.current;
    const j = i + dir;
    if (j < 0 || j >= xs.length) return;
    const next = [...xs];
    [next[i], next[j]] = [next[j], next[i]];
    exercisesRef.current = next;
    setExercises(next);
  };

  const hasReaction = exercises.some((e) => e.type === "reaction");

  const save = async () => {
    const current = exercisesRef.current;
    if (!name.trim() || current.length === 0) {
      setError("Name your workout and add at least one exercise.");
      return;
    }
    const hasReactionNow = current.some((e) => e.type === "reaction");
    try {
      await createWorkout({
        name: name.trim(),
        workSecs,
        restSecs,
        sets,
        reactionMinSecs: hasReactionNow ? reactionMin : null,
        reactionMaxSecs: hasReactionNow ? reactionMax : null,
        exerciseIds: current.map((e) => e.id),
      });
      router.replace("/workouts");
    } catch (e: any) {
      setError(e?.message ?? "Could not save.");
    }
  };

  const engineExercises: EngineExercise[] = exercises.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    mediaUrl: e.mediaUrl,
    config: e.config,
  }));
  const settings: WorkoutSettings = {
    workSecs,
    restSecs,
    sets,
    reactionMinSecs: hasReaction ? reactionMin : null,
    reactionMaxSecs: hasReaction ? reactionMax : null,
  };
  const total = totalDurationSecs(flattenWorkout(engineExercises, settings));

  const numField = (
    label: string,
    value: number,
    onChange: (n: number) => void,
  ) => (
    <View style={{ gap: 2 }}>
      <Text style={{ fontSize: 12, color: "#666" }}>{label}</Text>
      <TextInput
        keyboardType="number-pad"
        value={String(value)}
        onChangeText={(t) => onChange(Number(t.replace(/[^0-9]/g, "")) || 0)}
        style={{ borderWidth: 1, padding: 8, borderRadius: 6, width: 64 }}
      />
    </View>
  );

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
      <TextInput
        placeholder="Workout name"
        value={name}
        onChangeText={setName}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />

      <Text style={{ fontWeight: "600" }}>Main settings</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {numField("Work s", workSecs, setWorkSecs)}
        {numField("Rest s", restSecs, setRestSecs)}
        {numField("Sets", sets, setSets)}
        {numField("React min", reactionMin, setReactionMin)}
        {numField("React max", reactionMax, setReactionMax)}
      </View>

      <Text style={{ fontWeight: "600" }}>
        Exercises ({exercises.length}) — total {Math.floor(total / 60)}:
        {String(total % 60).padStart(2, "0")}
      </Text>

      {exercises.map((e, i) => (
        <View
          key={`${e.id}-${i}`}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 16 }}>{e.name}</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={() => move(i, -1)}><Text>↑</Text></Pressable>
            <Pressable onPress={() => move(i, 1)}><Text>↓</Text></Pressable>
            <Pressable onPress={() => remove(i)}><Text style={{ color: "#dc2626" }}>✕</Text></Pressable>
          </View>
        </View>
      ))}

      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}

      <Pressable onPress={save} style={{ backgroundColor: "#222", padding: 14, borderRadius: 8 }}>
        <Text style={{ color: "white", textAlign: "center" }}>Save</Text>
      </Pressable>

      <Text style={{ fontWeight: "600", marginTop: 8 }}>Add an exercise</Text>
      <ExercisePicker onSelect={add} />
    </ScrollView>
  );
}
