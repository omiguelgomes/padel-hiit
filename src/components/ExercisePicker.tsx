import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { listExercises, type CatalogExercise } from "../lib/catalog";
import { TextField } from "./ui";
import { colors, spacing, radius, font } from "../theme";

export default function ExercisePicker({
  onSelect,
  onPreview,
}: {
  onSelect: (exercise: CatalogExercise) => void;
  onPreview?: (exercise: CatalogExercise) => void;
}) {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CatalogExercise[]>([]);

  useEffect(() => {
    let active = true;
    listExercises({ search })
      .then((r) => {
        if (active) setItems(r);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <View style={{ gap: spacing.md }}>
      <TextField
        placeholder="Search exercises"
        autoCapitalize="none"
        value={search}
        onChangeText={setSearch}
      />
      <FlatList
        data={items}
        scrollEnabled={false}
        keyExtractor={(x) => x.id}
        contentContainerStyle={{ gap: spacing.sm }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
            style={({ pressed }) => ({
              flexDirection: "row",
              gap: spacing.md,
              alignItems: "center",
              padding: spacing.sm,
              borderRadius: radius.md,
              backgroundColor: pressed ? colors.primarySoft : colors.surface,
              borderWidth: 1,
              borderColor: colors.border,
            })}
          >
            {item.mediaUrl ? (
              <Image
                source={{ uri: item.mediaUrl }}
                style={{ width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.bg }}
                contentFit="cover"
              />
            ) : (
              <View
                style={{ width: 64, height: 64, borderRadius: radius.sm, backgroundColor: colors.primarySoft }}
              />
            )}
            <Text style={[font.body, { flexShrink: 1, fontWeight: "600" }]}>{item.name}</Text>
            {onPreview ? (
              <Pressable
                onPress={(e) => {
                  // The row itself adds the exercise in the builder — stop the
                  // press here so previewing never also adds.
                  e.stopPropagation();
                  onPreview(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${item.name}`}
                hitSlop={8}
                style={{ marginLeft: "auto", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
              >
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>ⓘ</Text>
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}
