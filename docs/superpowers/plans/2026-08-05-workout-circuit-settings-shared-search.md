# Workout Circuit Settings + Shared Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move workout timing from per-exercise blocks to a single set of workout-level "main settings" (work time, rest between exercises, sets, reaction call-out interval), and make the builder's exercise search reuse the Library's thumbnail search component.

**Architecture:** A workout becomes a name + four global settings + an ordered list of exercises (the circuit). The pure engine flattens `(exercises, settings)` into timed steps with rest uniform *between* exercises. The Library's search+thumbnail list is extracted into a shared `ExercisePicker` component consumed by both Library and Builder. A new migration moves timing columns from `workout_blocks` onto `workouts`.

**Tech Stack:** Expo SDK 57 (React Native + RN Web, expo-router, TypeScript), Supabase (Postgres), Jest + @testing-library/react-native.

## Global Constraints

- Expo SDK 57; read versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing Expo code.
- Jest config is inline in `package.json` (no jest.config.js). Full-suite command (run from repo root):
  `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
- `owner_id` on a workout is always stamped from `supabase.auth.getUser()` server-derived value — never from client input.
- Media is hotlinked (expo-image `source={{ uri }}`), never re-hosted.
- `jest.mock()` factories cannot close over out-of-scope vars unless the var name is `mock`-prefixed.
- Bare strings must be wrapped in `<Text>`.
- The builder/library FlatList leaks VirtualizedList timers across tests; a test must fire a synchronous state change (e.g. `changeText`) before list items are queryable.
- This is a breaking schema change: old per-block timings are discarded. Live DB holds only throwaway test data — acceptable, no data preservation.

## File Structure

- `supabase/migrations/0005_workout_level_settings.sql` — **create.** Adds timing columns to `workouts`, drops them from `workout_blocks`.
- `src/lib/workout-engine.ts` — **modify.** New `flattenWorkout(exercises, settings)` signature; `WorkoutSettings` type; remove `BlockDef`, `round`/`totalRounds`.
- `src/lib/__tests__/workout-engine.test.ts` — **rewrite** for circuit semantics.
- `src/lib/workouts.ts` — **modify.** `createWorkout` new input; `getWorkout` returns `{settings, exercises}`; remove `NewBlock`.
- `src/lib/__tests__/workouts.test.ts` — **modify** column-mapping assertions.
- `src/components/ExercisePicker.tsx` — **create.** Shared search + thumbnail list.
- `src/components/__tests__/ExercisePicker.test.tsx` — **create.**
- `src/app/(app)/library.tsx` — **modify** to render `ExercisePicker`.
- `src/app/(app)/builder.tsx` — **modify** to workout-level settings + `ExercisePicker`.
- `src/app/__tests__/builder.test.tsx` — **modify.**
- `src/app/(app)/player/[id].tsx` — **modify** to new engine signature; drop round display.
- `src/app/__tests__/player.test.tsx` — **modify** mock shape.

---

### Task 1: Migration — move timing to workout level

**Files:**
- Create: `supabase/migrations/0005_workout_level_settings.sql`

**Interfaces:**
- Produces: `workouts` columns `work_secs`, `rest_secs`, `sets` (all `int not null default …`), `reaction_min_secs`, `reaction_max_secs` (nullable `int`). `workout_blocks` reduced to `(id, workout_id, "order", exercise_id)`.

This is a pure-SQL task with no unit test — it is verified by review of the DDL against the design. The file is the reproducible source of truth; it is NOT applied to the live DB as part of this task (Miguel applies migrations via the Management API separately).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0005_workout_level_settings.sql`:

```sql
-- Timing moves from per-block to per-workout: one work interval, one
-- rest-between-exercises interval, one set count, and one reaction call-out
-- range for the whole circuit. A block is now just an ordered exercise slot.

alter table workouts
  add column work_secs int not null default 30,
  add column rest_secs int not null default 10,
  add column sets int not null default 1,
  add column reaction_min_secs int,
  add column reaction_max_secs int;

alter table workout_blocks
  drop column work_secs,
  drop column rest_secs,
  drop column rounds,
  drop column sets,
  drop column reaction_min_secs,
  drop column reaction_max_secs;
```

- [ ] **Step 2: Verify the DDL is internally consistent**

Confirm by reading: every column named in the design §1 is present with the stated type/nullability/default; the six dropped columns match the current `0001_init.sql` `workout_blocks` definition (`work_secs, rest_secs, rounds, sets, reaction_min_secs, reaction_max_secs`); `id`, `workout_id`, `"order"`, `exercise_id` are NOT dropped.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0005_workout_level_settings.sql
git commit -m "feat: migration 0005 — workout-level timing settings"
```

---

### Task 2: Engine — circuit flattening

**Files:**
- Modify: `src/lib/workout-engine.ts`
- Test: `src/lib/__tests__/workout-engine.test.ts` (rewrite)

**Interfaces:**
- Consumes: `EngineExercise` (unchanged — `{id, name, type, mediaUrl, config}`).
- Produces:
  - `type WorkoutSettings = { workSecs: number; restSecs: number; sets: number; reactionMinSecs?: number | null; reactionMaxSecs?: number | null }`
  - `flattenWorkout(exercises: EngineExercise[], settings: WorkoutSettings): WorkoutStep[]`
  - `WorkoutStep` work variant: `{ kind: "work"; exercise; durationSecs; set; totalSets; reaction: { minSecs; maxSecs } | null }` — **no `round`/`totalRounds`**. Rest variant unchanged: `{ kind: "rest"; durationSecs }`.
  - `totalDurationSecs(steps)` unchanged.
  - `BlockDef` is removed.

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `src/lib/__tests__/workout-engine.test.ts`:

```ts
// src/lib/__tests__/workout-engine.test.ts
import {
  flattenWorkout,
  totalDurationSecs,
  type WorkoutSettings,
  type EngineExercise,
} from "../workout-engine";

const standard: EngineExercise = {
  id: "jj",
  name: "Jumping Jacks",
  type: "standard",
  mediaUrl: null,
  config: {},
};
const reaction: EngineExercise = {
  id: "swing",
  name: "Reaction Swing",
  type: "reaction",
  mediaUrl: null,
  config: { pool: [] },
};

const settings = (over: Partial<WorkoutSettings> = {}): WorkoutSettings => ({
  workSecs: 30,
  restSecs: 10,
  sets: 1,
  ...over,
});

test("single exercise, single set produces one work and no rest", () => {
  const steps = flattenWorkout([standard], settings());
  expect(steps.map((s) => s.kind)).toEqual(["work"]);
});

test("rest is uniform between exercises with no trailing rest", () => {
  const steps = flattenWorkout([standard, reaction, standard], settings());
  expect(steps.map((s) => s.kind)).toEqual([
    "work", "rest", "work", "rest", "work",
  ]);
});

test("repeats the whole circuit `sets` times, no trailing rest at the very end", () => {
  const steps = flattenWorkout([standard, reaction], settings({ sets: 2 }));
  // set1: work rest work rest, set2: work rest work
  expect(steps.map((s) => s.kind)).toEqual([
    "work", "rest", "work", "rest", "work", "rest", "work",
  ]);
  const works = steps.filter((s) => s.kind === "work") as any[];
  expect(works.map((w) => [w.set, w.totalSets])).toEqual([
    [1, 2], [1, 2], [2, 2], [2, 2],
  ]);
});

test("skips all rest when restSecs <= 0", () => {
  const steps = flattenWorkout([standard, reaction], settings({ restSecs: 0, sets: 2 }));
  expect(steps.map((s) => s.kind)).toEqual(["work", "work", "work", "work"]);
});

test("carries workout-level reaction range on reaction exercises, null otherwise", () => {
  const steps = flattenWorkout(
    [standard, reaction],
    settings({ reactionMinSecs: 2, reactionMaxSecs: 5 }),
  );
  const works = steps.filter((s) => s.kind === "work") as any[];
  expect(works[0].reaction).toBeNull();
  expect(works[1].reaction).toEqual({ minSecs: 2, maxSecs: 5 });
});

test("reaction is null when range is not set even for reaction exercises", () => {
  const steps = flattenWorkout([reaction], settings());
  const works = steps.filter((s) => s.kind === "work") as any[];
  expect(works[0].reaction).toBeNull();
});

test("work steps carry the configured duration", () => {
  const steps = flattenWorkout([standard], settings({ workSecs: 45 }));
  expect((steps[0] as any).durationSecs).toBe(45);
});

test("totalDurationSecs sums every step", () => {
  // 2 exercises, 2 sets, workSecs 30, restSecs 10:
  // works = 4*30 = 120; rests = 3*10 = 30 (no trailing) => 150
  const steps = flattenWorkout([standard, reaction], settings({ sets: 2 }));
  expect(totalDurationSecs(steps)).toBe(150);
});

test("empty exercise list produces no steps", () => {
  expect(flattenWorkout([], settings())).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/__tests__/workout-engine.test.ts --modulePathIgnorePatterns /.claude/`
Expected: FAIL — old signature / removed exports.

- [ ] **Step 3: Rewrite the engine**

Replace the entire contents of `src/lib/workout-engine.ts`:

```ts
// src/lib/workout-engine.ts
export type EngineExercise = {
  id: string;
  name: string;
  type: "standard" | "reaction";
  mediaUrl: string | null;
  config: Record<string, unknown>;
};

export type WorkoutSettings = {
  workSecs: number;
  restSecs: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
};

export type WorkoutStep =
  | {
      kind: "work";
      exercise: EngineExercise;
      durationSecs: number;
      set: number;
      totalSets: number;
      reaction: { minSecs: number; maxSecs: number } | null;
    }
  | { kind: "rest"; durationSecs: number };

// Flatten a workout circuit into an ordered list of timed steps.
// The exercise list is run once per set. Rest is uniform between exercises:
// it follows every work interval except the very last of the whole workout,
// and is omitted entirely when restSecs <= 0.
export function flattenWorkout(
  exercises: EngineExercise[],
  settings: WorkoutSettings,
): WorkoutStep[] {
  const reaction =
    settings.reactionMinSecs != null && settings.reactionMaxSecs != null
      ? { minSecs: settings.reactionMinSecs, maxSecs: settings.reactionMaxSecs }
      : null;

  const works: WorkoutStep[] = [];
  for (let set = 1; set <= settings.sets; set++) {
    for (const exercise of exercises) {
      works.push({
        kind: "work",
        exercise,
        durationSecs: settings.workSecs,
        set,
        totalSets: settings.sets,
        reaction: exercise.type === "reaction" ? reaction : null,
      });
    }
  }

  const steps: WorkoutStep[] = [];
  works.forEach((work, i) => {
    steps.push(work);
    const isLast = i === works.length - 1;
    if (!isLast && settings.restSecs > 0) {
      steps.push({ kind: "rest", durationSecs: settings.restSecs });
    }
  });

  return steps;
}

export function totalDurationSecs(steps: WorkoutStep[]): number {
  return steps.reduce((sum, s) => sum + s.durationSecs, 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/workout-engine.test.ts --modulePathIgnorePatterns /.claude/`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workout-engine.ts src/lib/__tests__/workout-engine.test.ts
git commit -m "feat: circuit engine — flattenWorkout(exercises, settings)"
```

---

### Task 3: Persistence — createWorkout & getWorkout

**Files:**
- Modify: `src/lib/workouts.ts`
- Test: `src/lib/__tests__/workouts.test.ts`

**Interfaces:**
- Consumes: `WorkoutSettings`, `EngineExercise` from `./workout-engine` (Task 2).
- Produces:
  - `createWorkout(input: { name: string; workSecs: number; restSecs: number; sets: number; reactionMinSecs?: number | null; reactionMaxSecs?: number | null; exerciseIds: string[] }): Promise<string>`
  - `type WorkoutDetail = { id: string; name: string; settings: WorkoutSettings; exercises: EngineExercise[] }`
  - `getWorkout(id: string): Promise<WorkoutDetail>`
  - `NewBlock` removed. `listWorkouts`, `WorkoutSummary`, `deleteWorkout` unchanged.

- [ ] **Step 1: Update the test file**

In `src/lib/__tests__/workouts.test.ts`, update the import on line 40 to drop nothing (still imports the four functions). Replace the `createWorkout` tests (the two named "stamps owner_id" and "inserts blocks with order index and mapped columns") and the `getWorkout` test with:

```ts
test("createWorkout stamps owner_id and workout-level settings, returns the id", async () => {
  const id = await createWorkout({
    name: "My WOD",
    workSecs: 30,
    restSecs: 10,
    sets: 3,
    reactionMinSecs: null,
    reactionMaxSecs: null,
    exerciseIds: [],
  });
  expect(id).toBe("w1");
  expect(state.inserted[0]).toEqual({
    name: "My WOD",
    owner_id: "user-1",
    work_secs: 30,
    rest_secs: 10,
    sets: 3,
    reaction_min_secs: null,
    reaction_max_secs: null,
  });
});

test("createWorkout inserts blocks as ordered exercise slots", async () => {
  await createWorkout({
    name: "My WOD",
    workSecs: 40,
    restSecs: 15,
    sets: 2,
    reactionMinSecs: 2,
    reactionMaxSecs: 5,
    exerciseIds: ["e1", "e2"],
  });
  expect(state.inserted[1]).toEqual([
    { workout_id: "w1", order: 0, exercise_id: "e1" },
    { workout_id: "w1", order: 1, exercise_id: "e2" },
  ]);
});

test("getWorkout maps settings and ordered exercises", async () => {
  (supabase as any).__builder.single.mockResolvedValueOnce({
    data: {
      id: "w1",
      name: "Padel HIIT",
      work_secs: 40, rest_secs: 15, sets: 2,
      reaction_min_secs: 2, reaction_max_secs: 5,
      workout_blocks: [
        {
          order: 1,
          exercises: { id: "e2", name: "Reaction Swing", type: "reaction", media_url: "https://x/bh.mp4", config: { pool: [] } },
        },
        {
          order: 0,
          exercises: { id: "e1", name: "Jumping Jacks", type: "standard", media_url: null, config: {} },
        },
      ],
    },
    error: null,
  });

  const out = await getWorkout("w1");

  expect((supabase as any).from).toHaveBeenCalledWith("workouts");
  expect(out.id).toBe("w1");
  expect(out.name).toBe("Padel HIIT");
  expect(out.settings).toEqual({
    workSecs: 40, restSecs: 15, sets: 2,
    reactionMinSecs: 2, reactionMaxSecs: 5,
  });
  // sorted by order: standard first, reaction second
  expect(out.exercises.map((e) => e.id)).toEqual(["e1", "e2"]);
  expect(out.exercises[0]).toEqual({
    id: "e1", name: "Jumping Jacks", type: "standard", mediaUrl: null, config: {},
  });
  expect(out.exercises[1].mediaUrl).toBe("https://x/bh.mp4");
});
```

Also update the two remaining `createWorkout` calls in the file (in the "listWorkouts" area there are none; the "throws when not signed in" test on ~line 112 calls `createWorkout({ name: "x", blocks: [] })`) — change that call to `createWorkout({ name: "x", workSecs: 30, restSecs: 10, sets: 1, exerciseIds: [] })`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/lib/__tests__/workouts.test.ts --modulePathIgnorePatterns /.claude/`
Expected: FAIL — payload shape mismatch / `out.settings` undefined.

- [ ] **Step 3: Rewrite the two functions**

In `src/lib/workouts.ts`: remove the `NewBlock` type. Import `WorkoutSettings, EngineExercise` alongside the existing type import. Replace `createWorkout` and `getWorkout` (and the `WorkoutDetail` type):

```ts
import type { WorkoutSettings, EngineExercise } from "./workout-engine";

export async function createWorkout(input: {
  name: string;
  workSecs: number;
  restSecs: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
  exerciseIds: string[];
}): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Not signed in");

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      name: input.name,
      owner_id: ownerId,
      work_secs: input.workSecs,
      rest_secs: input.restSecs,
      sets: input.sets,
      reaction_min_secs: input.reactionMinSecs ?? null,
      reaction_max_secs: input.reactionMaxSecs ?? null,
    })
    .select("id")
    .single();
  if (wErr) throw wErr;

  const rows = input.exerciseIds.map((exerciseId, i) => ({
    workout_id: workout.id,
    order: i,
    exercise_id: exerciseId,
  }));

  if (rows.length > 0) {
    const { error: bErr } = await supabase.from("workout_blocks").insert(rows);
    if (bErr) throw bErr;
  }

  return workout.id;
}

export type WorkoutDetail = {
  id: string;
  name: string;
  settings: WorkoutSettings;
  exercises: EngineExercise[];
};

export async function getWorkout(id: string): Promise<WorkoutDetail> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, name, work_secs, rest_secs, sets, reaction_min_secs, reaction_max_secs, workout_blocks(order, exercises(id, name, type, media_url, config))",
    )
    .eq("id", id)
    .single();
  if (error) throw error;

  const exercises: EngineExercise[] = (data.workout_blocks ?? [])
    .slice()
    .sort((a: any, b: any) => a.order - b.order)
    .map((b: any) => ({
      id: b.exercises.id,
      name: b.exercises.name,
      type: b.exercises.type,
      mediaUrl: b.exercises.media_url ?? null,
      config: b.exercises.config ?? {},
    }));

  return {
    id: data.id,
    name: data.name,
    settings: {
      workSecs: data.work_secs,
      restSecs: data.rest_secs,
      sets: data.sets,
      reactionMinSecs: data.reaction_min_secs,
      reactionMaxSecs: data.reaction_max_secs,
    },
    exercises,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/workouts.test.ts --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workouts.ts src/lib/__tests__/workouts.test.ts
git commit -m "feat: persist workout-level settings + bare exercise slots"
```

---

### Task 4: Shared ExercisePicker component

**Files:**
- Create: `src/components/ExercisePicker.tsx`
- Create: `src/components/__tests__/ExercisePicker.test.tsx`
- Modify: `src/app/(app)/library.tsx`

**Interfaces:**
- Consumes: `listExercises`, `CatalogExercise` from `../lib/catalog`.
- Produces: `export default function ExercisePicker({ onSelect }: { onSelect: (exercise: CatalogExercise) => void })` — a self-contained search box + thumbnail FlatList. Each row is pressable and calls `onSelect(item)`.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/ExercisePicker.test.tsx`:

```tsx
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-image", () => ({ Image: () => null }));

const mockListExercises = jest.fn().mockResolvedValue([
  { id: "e1", name: "Push Up", type: "standard", source: "exercisedb", mediaUrl: "https://x/p.gif", config: {} },
]);
jest.mock("../../lib/catalog", () => ({
  listExercises: (...a: any[]) => mockListExercises(...a),
}));

import ExercisePicker from "../ExercisePicker";

beforeEach(() => jest.clearAllMocks());

test("lists exercises and calls onSelect when a row is pressed", async () => {
  const onSelect = jest.fn();
  const { getByText, getByPlaceholderText } = await render(
    <ExercisePicker onSelect={onSelect} />,
  );
  // trigger the search state so the list flushes
  fireEvent.changeText(getByPlaceholderText("Search exercises"), "push");
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  fireEvent.press(getByText("Push Up"));
  expect(onSelect).toHaveBeenCalledWith(
    expect.objectContaining({ id: "e1", name: "Push Up" }),
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/components/__tests__/ExercisePicker.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `src/components/ExercisePicker.tsx` (lifts the Library search+row verbatim, adds a pressable wrapper + `onSelect`):

```tsx
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/components/__tests__/ExercisePicker.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Refactor Library to use it**

Replace the entire contents of `src/app/(app)/library.tsx`:

```tsx
import { View } from "react-native";
import ExercisePicker from "../../components/ExercisePicker";

export default function Library() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ExercisePicker onSelect={() => {}} />
    </View>
  );
}
```

- [ ] **Step 6: Run the library test to verify it still passes**

Run: `npx jest src/app/__tests__/library.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS. If the existing library test asserts on the old internal structure and fails, adjust it minimally to render `Library` and assert an exercise name appears after typing in the "Search exercises" box (same pattern as the ExercisePicker test). Do not add new behavior.

- [ ] **Step 7: Commit**

```bash
git add src/components/ExercisePicker.tsx src/components/__tests__/ExercisePicker.test.tsx src/app/\(app\)/library.tsx src/app/__tests__/library.test.tsx
git commit -m "feat: shared ExercisePicker with previews; Library reuses it"
```

---

### Task 5: Builder — main settings + shared picker

**Files:**
- Modify: `src/app/(app)/builder.tsx`
- Test: `src/app/__tests__/builder.test.tsx`

**Interfaces:**
- Consumes: `ExercisePicker` (Task 4), `createWorkout` (Task 3), `flattenWorkout`/`totalDurationSecs`/`WorkoutSettings`/`EngineExercise` (Task 2), `CatalogExercise` from catalog.
- Produces: builder screen with workout-level settings and an ordered exercise list; `save` calls `createWorkout({ name, workSecs, restSecs, sets, reactionMinSecs, reactionMaxSecs, exerciseIds })`.

- [ ] **Step 1: Update the test file**

Replace the entire contents of `src/app/__tests__/builder.test.tsx`:

```tsx
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import React from "react";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));

const mockListExercises = jest.fn().mockResolvedValue([
  { id: "e1", name: "Push Up", type: "standard", source: "exercisedb", mediaUrl: null, config: {} },
]);
jest.mock("../../lib/catalog", () => ({
  listExercises: (...a: any[]) => mockListExercises(...a),
}));

const mockCreate = jest.fn().mockResolvedValue("w1");
jest.mock("../../lib/workouts", () => ({
  createWorkout: (...a: any[]) => mockCreate(...a),
}));

import Builder from "../(app)/builder";

beforeEach(() => jest.clearAllMocks());

test("builds a workout with workout-level settings and an exercise slot", async () => {
  const { getByText, getByPlaceholderText } = await render(<Builder />);

  fireEvent.changeText(getByPlaceholderText("Workout name"), "Morning WOD");
  // typing in the picker search flushes the list
  fireEvent.changeText(getByPlaceholderText("Search exercises"), "push");

  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  await act(async () => {
    fireEvent.press(getByText("Push Up"));
  });

  await act(async () => {
    fireEvent.press(getByText("Save"));
  });

  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      name: "Morning WOD",
      workSecs: 30,
      restSecs: 10,
      sets: 1,
      reactionMinSecs: null,
      reactionMaxSecs: null,
      exerciseIds: ["e1"],
    }),
  );
  expect(mockReplace).toHaveBeenCalledWith("/workouts");
});
```

Note: the empty-name/no-exercise guard test is intentionally omitted — it renders without a synchronous list flush and leaks FlatList timers cross-suite (documented gotcha). The guard logic itself is retained in the component.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/__tests__/builder.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: FAIL.

- [ ] **Step 3: Rewrite the builder**

Replace the entire contents of `src/app/(app)/builder.tsx`:

```tsx
// src/app/(app)/builder.tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { type CatalogExercise } from "../../lib/catalog";
import { createWorkout } from "../../lib/workouts";
import {
  flattenWorkout,
  totalDurationSecs,
  type EngineExercise,
  type WorkoutSettings,
} from "../../lib/workout-engine";
import ExercisePicker from "../../components/ExercisePicker";

export default function Builder() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [workSecs, setWorkSecs] = useState(30);
  const [restSecs, setRestSecs] = useState(10);
  const [sets, setSets] = useState(1);
  const [reactionMin, setReactionMin] = useState(2);
  const [reactionMax, setReactionMax] = useState(5);
  const [exercises, setExercises] = useState<CatalogExercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  const add = (ex: CatalogExercise) => setExercises((xs) => [...xs, ex]);
  const remove = (i: number) =>
    setExercises((xs) => xs.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    setExercises((xs) => {
      const j = i + dir;
      if (j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const hasReaction = exercises.some((e) => e.type === "reaction");

  const save = async () => {
    if (!name.trim() || exercises.length === 0) {
      setError("Name your workout and add at least one exercise.");
      return;
    }
    try {
      await createWorkout({
        name: name.trim(),
        workSecs,
        restSecs,
        sets,
        reactionMinSecs: hasReaction ? reactionMin : null,
        reactionMaxSecs: hasReaction ? reactionMax : null,
        exerciseIds: exercises.map((e) => e.id),
      });
      router.replace("/workouts");
    } catch (e: any) {
      setError(e?.message ?? "Could not save.");
    }
  };

  const engineExercises: EngineExercise[] = exercises.map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    mediaUrl: e.mediaUrl,
    config: e.config,
  }));
  const settings: WorkoutSettings = {
    workSecs,
    restSecs,
    sets,
    reactionMinSecs: hasReaction ? reactionMin : null,
    reactionMaxSecs: hasReaction ? reactionMax : null,
  };
  const total = totalDurationSecs(flattenWorkout(engineExercises, settings));

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

      <Text style={{ fontWeight: "600" }}>Main settings</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {numField("Work s", workSecs, setWorkSecs)}
        {numField("Rest s", restSecs, setRestSecs)}
        {numField("Sets", sets, setSets)}
        {numField("React min", reactionMin, setReactionMin)}
        {numField("React max", reactionMax, setReactionMax)}
      </View>

      <Text style={{ fontWeight: "600" }}>
        Exercises ({exercises.length}) — total {Math.floor(total / 60)}:
        {String(total % 60).padStart(2, "0")}
      </Text>

      {exercises.map((e, i) => (
        <View
          key={`${e.id}-${i}`}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 16 }}>{e.name}</Text>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable onPress={() => move(i, -1)}><Text>↑</Text></Pressable>
            <Pressable onPress={() => move(i, 1)}><Text>↓</Text></Pressable>
            <Pressable onPress={() => remove(i)}><Text style={{ color: "#dc2626" }}>✕</Text></Pressable>
          </View>
        </View>
      ))}

      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}

      <Pressable onPress={save} style={{ backgroundColor: "#222", padding: 14, borderRadius: 8 }}>
        <Text style={{ color: "white", textAlign: "center" }}>Save</Text>
      </Pressable>

      <Text style={{ fontWeight: "600", marginTop: 8 }}>Add an exercise</Text>
      <ExercisePicker onSelect={add} />
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/__tests__/builder.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/builder.tsx src/app/__tests__/builder.test.tsx
git commit -m "feat: builder uses workout-level settings + shared picker"
```

---

### Task 6: Player — new engine signature

**Files:**
- Modify: `src/app/(app)/player/[id].tsx`
- Test: `src/app/__tests__/player.test.tsx`

**Interfaces:**
- Consumes: `getWorkout` returning `{ settings, exercises }` (Task 3); `flattenWorkout(exercises, settings)` (Task 2).

- [ ] **Step 1: Update the test file**

In `src/app/__tests__/player.test.tsx`, replace the `mockGetWorkout` definition (lines ~19-29) so it returns the new shape:

```tsx
const mockGetWorkout = jest.fn().mockResolvedValue({
  id: "w1",
  name: "Padel HIIT",
  settings: { workSecs: 30, restSecs: 10, sets: 2, reactionMinSecs: null, reactionMaxSecs: null },
  exercises: [
    { id: "e1", name: "Jumping Jacks", type: "standard", mediaUrl: null, config: {} },
    { id: "e2", name: "High Knees", type: "standard", mediaUrl: null, config: {} },
  ],
});
```

The two existing tests still hold: first step is "Jumping Jacks" (work), and pressing Skip lands on a "Rest" step (rest follows the first exercise because a second exercise/set exists).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/__tests__/player.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: FAIL — `w.blocks` undefined / `flattenWorkout` arity.

- [ ] **Step 3: Update the Player**

In `src/app/(app)/player/[id].tsx`:

Change the load call (currently `const flat = flattenWorkout(w.blocks);`) to:

```tsx
const flat = flattenWorkout(w.exercises, w.settings);
```

Remove the round display block (currently lines ~143-148):

```tsx
      {step!.kind === "work" ? (
        <Text style={{ color: "#666" }}>
          Round {step!.round}/{step!.totalRounds}
          {step!.totalSets > 1 ? ` · Set ${step!.set}/${step!.totalSets}` : ""}
        </Text>
      ) : null}
```

Replace it with a set-only indicator:

```tsx
      {step!.kind === "work" && step!.totalSets > 1 ? (
        <Text style={{ color: "#666" }}>
          Set {step!.set}/{step!.totalSets}
        </Text>
      ) : null}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/__tests__/player.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/player/\[id\].tsx src/app/__tests__/player.test.tsx
git commit -m "feat: player runs the circuit via new engine signature"
```

---

## Self-Review

**Spec coverage:**
- Design §1 data model → Task 1 (migration). ✓
- Design §2 engine → Task 2. ✓
- Design §3 shared search → Task 4. ✓
- Design §4 builder → Task 5. ✓
- Design §5 persistence → Task 3. ✓
- Design §6 player → Task 6. ✓
- Testing section → tests in every task + full-suite run in Task 6 Step 5. ✓

**Type consistency:** `WorkoutSettings` defined in Task 2, consumed identically in Tasks 3/5/6. `flattenWorkout(exercises, settings)` arity matches across Tasks 2/5/6. `createWorkout` input shape identical in Task 3 (def), Task 5 (call), and its test. `getWorkout` returns `{settings, exercises}` in Task 3, consumed as `w.exercises`/`w.settings` in Task 6. `round`/`totalRounds` removed in Task 2 and no later task references them (Task 6 removes the only display use). ✓

**Placeholder scan:** No TBD/TODO; every code step has full content; test code is concrete. ✓
