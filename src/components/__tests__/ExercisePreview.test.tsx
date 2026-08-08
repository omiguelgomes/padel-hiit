import { render, fireEvent } from "@testing-library/react-native";
import React from "react";

// Record what expo-image is asked to render: the sibling tests mock Image away
// as `() => null`, which would hide the very URL these assertions check.
const imageUris: (string | undefined)[] = [];
jest.mock("expo-image", () => ({
  Image: (props: any) => {
    imageUris.push(props.source?.uri);
    return null;
  },
}));

// Severs the env dependency of src/lib/supabase.ts (createClient() at module
// scope needs EXPO_PUBLIC_SUPABASE_URL/ANON_KEY, which this worktree has no
// .env for) while keeping the real catalog accessors under test.
jest.mock("../../lib/supabase", () => ({ supabase: {} }));

import ExercisePreview from "../ExercisePreview";
import type { CatalogExercise } from "../../lib/catalog";

beforeEach(() => {
  imageUris.length = 0;
});

const full: CatalogExercise = {
  id: "e1",
  name: "barbell standing close grip curl",
  type: "standard",
  source: "exercisedb",
  mediaUrl: "https://cdn.example.com/curl.png",
  gifUrl: "https://cdn.example.com/curl-720p.gif",
  config: {
    overview: "A strength exercise that targets the biceps.",
    instructions: ["Step:1 Stand up straight.", "Step:2 Curl the bar."],
    target_muscles: ["biceps"],
    secondary_muscles: ["forearms"],
    body_parts: ["upper arms"],
    equipments: ["barbell"],
    exercise_types: ["strength"],
    difficulty: "beginner",
  },
};

const bare: CatalogExercise = {
  id: "r1",
  name: "Volley",
  type: "reaction",
  source: "padel",
  mediaUrl: null,
  gifUrl: null,
  config: {},
};

test("renders nothing when no exercise is selected", async () => {
  const { toJSON } = await render(<ExercisePreview exercise={null} onClose={() => {}} />);
  expect(toJSON()).toBeNull();
});

test("shows the name, overview and instruction text", async () => {
  const { getByText } = await render(<ExercisePreview exercise={full} onClose={() => {}} />);
  expect(getByText("barbell standing close grip curl")).toBeTruthy();
  expect(getByText("A strength exercise that targets the biceps.")).toBeTruthy();
  expect(getByText("Stand up straight.")).toBeTruthy();
  expect(getByText("Curl the bar.")).toBeTruthy();
});

test("numbers instructions itself and drops the upstream Step:N marker", async () => {
  const { queryByText, getByText } = await render(<ExercisePreview exercise={full} onClose={() => {}} />);
  expect(queryByText(/Step:1/)).toBeNull();
  expect(getByText("1")).toBeTruthy();
});

test("shows metadata chips", async () => {
  const { getByText } = await render(<ExercisePreview exercise={full} onClose={() => {}} />);
  for (const chip of ["biceps", "forearms", "upper arms", "barbell", "strength", "beginner"]) {
    expect(getByText(chip)).toBeTruthy();
  }
});

test("prefers the gif over the static image", async () => {
  await render(<ExercisePreview exercise={full} onClose={() => {}} />);
  expect(imageUris).toContain("https://cdn.example.com/curl-720p.gif");
  expect(imageUris).not.toContain("https://cdn.example.com/curl.png");
});

test("falls back to the static image when there is no gif", async () => {
  await render(<ExercisePreview exercise={{ ...full, gifUrl: null }} onClose={() => {}} />);
  expect(imageUris).toContain("https://cdn.example.com/curl.png");
});

test("omits empty sections for an exercise with no metadata", async () => {
  const { getByText, queryByText } = await render(<ExercisePreview exercise={bare} onClose={() => {}} />);
  expect(getByText("Volley")).toBeTruthy();
  expect(queryByText("Instructions")).toBeNull();
  expect(queryByText("biceps")).toBeNull();
});

test("calls onClose when the close button is pressed", async () => {
  const onClose = jest.fn();
  const { getByLabelText } = await render(<ExercisePreview exercise={full} onClose={onClose} />);
  fireEvent.press(getByLabelText("Close preview"));
  expect(onClose).toHaveBeenCalled();
});
