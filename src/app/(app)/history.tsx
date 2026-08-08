import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listHistory, type HistoryEntry } from "../../lib/history";
import { setPendingRun } from "../../lib/run-session";
import { Screen, Card } from "../../components/ui";
import { colors, spacing, font } from "../../theme";

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function History() {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const router = useRouter();

  const refresh = useCallback(() => {
    listHistory()
      .then(setItems)
      .catch(() => setItems([]));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const repeat = (entry: HistoryEntry) => {
    setPendingRun(entry.snapshot);
    router.push("/player/repeat");
  };

  return (
    <Screen>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
        ListEmptyComponent={
          <Text style={[font.muted, { textAlign: "center", marginTop: spacing.xl }]}>
            No completed workouts yet.
          </Text>
        }
        renderItem={({ item }) => (
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexShrink: 1 }}>
                <Text style={font.h3}>{item.snapshot.name}</Text>
                <Text style={font.muted}>{formatDate(item.completedAt)}</Text>
              </View>
              <Pressable onPress={() => repeat(item)}>
                <Text style={{ color: colors.primary, fontWeight: "700" }}>Repeat</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}
