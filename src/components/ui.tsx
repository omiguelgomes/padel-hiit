// Reusable UI primitives built on the design tokens in ../theme.
// Every screen composes these so the look stays consistent and responsive.
import { type ReactNode } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  type TextInputProps,
  type ViewStyle,
  type StyleProp,
} from "react-native";
import { colors, spacing, radius, font, shadow, CONTENT_MAX_WIDTH } from "../theme";

// Full-screen container: bright background, centered + width-capped column so
// it reads well on phones and doesn't sprawl on wide web viewports.
export function Screen({
  children,
  scroll = false,
  center = false,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  center?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const inner: StyleProp<ViewStyle> = [
    { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", padding: spacing.xl, gap: spacing.lg },
    center && { flex: 1, justifyContent: "center" },
    contentStyle,
  ];

  if (scroll) {
    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.bg }}
        contentContainerStyle={[{ flexGrow: 1, alignItems: "stretch" }, center && { justifyContent: "center" }]}
      >
        <View style={inner}>{children}</View>
      </ScrollView>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "stretch" }}>
      <View style={[{ flex: 1 }, inner]}>{children}</View>
    </View>
  );
}

export function ScreenTitle({ children }: { children: ReactNode }) {
  return <Text style={font.h1}>{children}</Text>;
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          padding: spacing.lg,
          borderWidth: 1,
          borderColor: colors.border,
          ...shadow,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const bg =
    variant === "primary" ? colors.primary : variant === "secondary" ? colors.primarySoft : "transparent";
  const border = variant === "secondary" ? colors.primary : "transparent";
  const textColor =
    variant === "primary" ? colors.onPrimary : variant === "danger" ? colors.danger : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderColor: border,
          borderWidth: border === "transparent" ? 0 : 1,
          paddingVertical: 14,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          alignItems: "center",
          justifyContent: "center",
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: textColor, fontSize: 16, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function TextField(props: TextInputProps & { style?: StyleProp<ViewStyle> }) {
  const { style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.textMuted}
      {...rest}
      style={[
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingVertical: 12,
          paddingHorizontal: spacing.md,
          fontSize: 16,
          color: colors.text,
        },
        style as any,
      ]}
    />
  );
}
