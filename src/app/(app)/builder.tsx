// src/app/(app)/builder.tsx
import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { listExercises, type CatalogExercise } from "../../lib/catalog";
import { createWorkout, type NewBlock } from "../../lib/workouts";
import {
  flattenWorkout,
  totalDurationSecs,
  type BlockDef,
} from "../../lib/workout-engine";

type BuilderBlock = NewBlock & { exercise: CatalogExercise };

const DEFAULTS = { workSecs: 30, restSecs: 10, rounds: 3, sets: 1 };

export default function Builder() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listExercises({ search })
      .then((r) => active && setCatalog(r))
      .catch(() => active && setCatalog([]));
    return () => {
      active = false;
    };
  }, [search]);

  const addBlock = (ex: CatalogExercise) => {
    setBlocks((b) => [
      ...b,
      {
        exercise: ex,
        exerciseId: ex.id,
        ...DEFAULTS,
        reactionMinSecs: ex.type === "reaction" ? 2 : null,
        reactionMaxSecs: ex.type === "reaction" ? 5 : null,
      },
    ]);
  };

  const patch = (i: number, field: keyof NewBlock, value: number) => {
    setBlocks((b) => b.map((blk, j) => (j === i ? { ...blk, [field]: value } : blk)));
  };

  const move = (i: number, dir: -1 | 1) => {
    setBlocks((b) => {
      const j = i + dir;
      if (j < 0 || j >= b.length) return b;
      const next = [...b];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const remove = (i: number) => setBlocks((b) => b.filter((_, j) => j !== i));

  const save = async () => {
    if (!name.trim() || blocks.length === 0) {
      setError("Name your workout and add at least one exercise.");
      return;
    }
    const payload = {
      name: name.trim(),
      blocks: blocks.map((b) => ({
        exerciseId: b.exerciseId,
        workSecs: b.workSecs,
        restSecs: b.restSecs,
        rounds: b.rounds,
        sets: b.sets,
        reactionMinSecs: b.reactionMinSecs ?? null,
        reactionMaxSecs: b.reactionMaxSecs ?? null,
      })),
    };
    try {
      await createWorkout(payload);
      router.replace("/workouts");
    } catch (e: any) {
      setError(e?.message ?? "Could not save.");
    }
  };

  const defs: BlockDef[] = blocks.map((b) => ({
    exercise: {
      id: b.exercise.id,
      name: b.exercise.name,
      type: b.exercise.type,
      mediaUrl: b.exercise.mediaUrl,
      config: b.exercise.config,
    },
    workSecs: b.workSecs,
    restSecs: b.restSecs,
    rounds: b.rounds,
    sets: b.sets,
    reactionMinSecs: b.reactionMinSecs,
    reactionMaxSecs: b.reactionMaxSecs,
  }));
  const total = totalDurationSecs(flattenWorkout(defs));

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

      <Text style={{ fontWeight: "600" }}>
        Blocks ({blocks.length}) — total {Math.floor(total / 60)}:
        {String(total % 60).padStart(2, "0")}
      </Text>

      {blocks.map((b, i) => (
        <View
          key={`${b.exerciseId}-${i}`}
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, gap: 8 }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16 }}>{b.exercise.name}</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable onPress={() => move(i, -1)}><Text>↑</Text></Pressable>
              <Pressable onPress={() => move(i, 1)}><Text>↓</Text></Pressable>
              <Pressable onPress={() => remove(i)}><Text style={{ color: "#dc2626" }}>✕</Text></Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {numField("Work s", b.workSecs, (n) => patch(i, "workSecs", n))}
            {numField("Rest s", b.restSecs, (n) => patch(i, "restSecs", n))}
            {numField("Rounds", b.rounds, (n) => patch(i, "rounds", n))}
            {numField("Sets", b.sets, (n) => patch(i, "sets", n))}
            {b.exercise.type === "reaction" ? (
              <>
                {numField("React min", b.reactionMinSecs ?? 0, (n) => patch(i, "reactionMinSecs", n))}
                {numField("React max", b.reactionMaxSecs ?? 0, (n) => patch(i, "reactionMaxSecs", n))}
              </>
            ) : null}
          </View>
        </View>
      ))}

      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}

      <Pressable onPress={save} style={{ backgroundColor: "#222", padding: 14, borderRadius: 8 }}>
        <Text style={{ color: "white", textAlign: "center" }}>Save</Text>
      </Pressable>

      <Text style={{ fontWeight: "600", marginTop: 8 }}>Add an exercise</Text>
      <TextInput
        placeholder="Search exercises"
        autoCapitalize="none"
        value={search}
        onChangeText={setSearch}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <FlatList
        data={catalog}
        scrollEnabled={false}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => addBlock(item)} style={{ paddingVertical: 10 }}>
            <Text style={{ fontSize: 16, color: "#2563eb" }}>{item.name}</Text>
          </Pressable>
        )}
      />
    </ScrollView>
  );
}
