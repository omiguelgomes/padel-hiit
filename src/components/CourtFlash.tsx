import { View } from "react-native";
import { type ReactionDirection } from "../lib/reaction";
import { colors, radius, spacing } from "../theme";

// A mini court drawn with plain Views: a tennis ball positioned left/center/
// right above a net bar. No media, no SVG — pure layout + color.
export default function CourtFlash({ direction }: { direction: ReactionDirection }) {
  const alignSelf =
    direction === "left" ? "flex-start" : direction === "right" ? "flex-end" : "center";

  return (
    <View
      testID="court-flash"
      style={{
        width: 240,
        height: 240,
        borderRadius: radius.lg,
        backgroundColor: "rgba(255,255,255,0.15)",
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.5)",
        padding: spacing.lg,
        justifyContent: "space-between",
      }}
    >
      {/* Ball row — aligned by direction */}
      <View style={{ flex: 1, justifyContent: "center" }}>
        <View
          testID={`court-ball-${direction}`}
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.pill,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.9)",
            alignSelf,
          }}
        />
      </View>
      {/* Net bar */}
      <View
        testID="court-net"
        style={{
          height: 12,
          borderRadius: radius.sm,
          backgroundColor: "rgba(255,255,255,0.85)",
        }}
      />
    </View>
  );
}
