import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import {
  listWorkouts,
  deleteWorkout,
  type WorkoutSummary,
} from "../../lib/workouts";

export default function Workouts() {
  const [items, setItems] = useState<WorkoutSummary[]>([]);

  const refresh = useCallback(() => {
    listWorkouts()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const remove = (id: string) => {
    deleteWorkout(id)
      .then(refresh)
      .catch(() => {});
  };

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Link href="/builder">
        <Text style={{ fontSize: 16, color: "#2563eb" }}>+ New workout</Text>
      </Link>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 16 }}>{item.name}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Link href={`/player/${item.id}`}>
                <Text style={{ color: "#2563eb" }}>Play</Text>
              </Link>
              <Pressable onPress={() => remove(item.id)} style={{ padding: 6 }}>
                <Text style={{ color: "#dc2626" }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}
