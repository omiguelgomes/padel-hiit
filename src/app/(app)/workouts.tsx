import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import {
  listWorkouts,
  deleteWorkout,
  type WorkoutSummary,
} from "../../lib/workouts";
import { Screen, Card, Button } from "../../components/ui";
import { colors, spacing, font } from "../../theme";

export default function Workouts() {
  const [items, setItems] = useState<WorkoutSummary[]>([]);
  const router = useRouter();

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
    <Screen>
      <Button label="+ New workout" onPress={() => router.push("/builder")} />

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
        ListEmptyComponent={
          <Text style={[font.muted, { textAlign: "center", marginTop: spacing.xl }]}>
            No workouts yet. Create your first one.
          </Text>
        }
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={[font.h3, { flexShrink: 1 }]}>{item.name}</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.lg }}>
                <Pressable onPress={() => router.push(`/player/${item.id}`)}>
                  <Text style={{ color: colors.primary, fontWeight: "700" }}>Play</Text>
                </Pressable>
                <Pressable onPress={() => remove(item.id)} style={{ padding: spacing.xs }}>
                  <Text style={{ color: colors.danger, fontWeight: "600" }}>Delete</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
