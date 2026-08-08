import { View, Text, Modal, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import {
  readOverview,
  readInstructions,
  readStringList,
  stripStepPrefix,
  type CatalogExercise,
} from "../lib/catalog";
import { colors, spacing, radius, font, shadow } from "../theme";

function Chips({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={font.muted}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {values.map((v) => (
          <View
            key={v}
            style={{
              backgroundColor: colors.primarySoft,
              paddingVertical: 4,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.pill,
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: "600" }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ExercisePreview({
  exercise,
  onClose,
}: {
  exercise: CatalogExercise | null;
  onClose: () => void;
}) {
  if (!exercise) return null;

  const media = exercise.gifUrl ?? exercise.mediaUrl;
  const overview = readOverview(exercise.config);
  const instructions = readInstructions(exercise.config);
  const difficulty = typeof exercise.config.difficulty === "string" ? exercise.config.difficulty : "";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" }}>
        <View
          style={{
            maxHeight: "85%",
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.xl,
            gap: spacing.lg,
            ...shadow,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
            <Text style={[font.h3, { flexShrink: 1 }]}>{exercise.name}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              style={{ marginLeft: "auto", padding: spacing.xs }}
            >
              <Text style={{ fontSize: 20, color: colors.textMuted, fontWeight: "700" }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.lg }}>
            {media ? (
              <Image
                source={{ uri: media }}
                style={{ width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.bg }}
                contentFit="contain"
              />
            ) : (
              <View
                style={{ width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.primarySoft }}
              />
            )}

            {overview ? <Text style={font.body}>{overview}</Text> : null}

            {instructions.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={font.h3}>Instructions</Text>
                {instructions.map((raw, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>{String(i + 1)}</Text>
                    <Text style={[font.body, { flexShrink: 1 }]}>{stripStepPrefix(raw)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Chips label="Target muscles" values={readStringList(exercise.config, "target_muscles")} />
            <Chips label="Secondary muscles" values={readStringList(exercise.config, "secondary_muscles")} />
            <Chips label="Body parts" values={readStringList(exercise.config, "body_parts")} />
            <Chips label="Equipment" values={readStringList(exercise.config, "equipments")} />
            <Chips label="Exercise types" values={readStringList(exercise.config, "exercise_types")} />
            <Chips label="Difficulty" values={difficulty ? [difficulty] : []} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
