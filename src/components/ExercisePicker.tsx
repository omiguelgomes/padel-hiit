import { useEffect, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable } from "react-native";
import { Image } from "expo-image";
import { listExercises, type CatalogExercise } from "../lib/catalog";

export default function ExercisePicker({
  onSelect,
}: {
  onSelect: (exercise: CatalogExercise) => void;
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
    <View style={{ gap: 12 }}>
      <TextInput
        placeholder="Search exercises"
        autoCapitalize="none"
        value={search}
        onChangeText={setSearch}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <FlatList
        data={items}
        scrollEnabled={false}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => onSelect(item)}
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              paddingVertical: 8,
            }}
          >
            {item.mediaUrl ? (
              <Image
                source={{ uri: item.mediaUrl }}
                style={{ width: 64, height: 64, borderRadius: 8 }}
                contentFit="cover"
              />
            ) : null}
            <Text style={{ fontSize: 16 }}>{item.name}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}
