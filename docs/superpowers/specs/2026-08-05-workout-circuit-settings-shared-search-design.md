# Workout Circuit Settings + Shared Search — Design

**Date:** 2026-08-05
**Status:** Approved (design), pending spec review

## Problem

The workout builder currently defines timing **per exercise**: each block
carries its own `work_secs`, `rest_secs`, `rounds`, `sets`, and reaction
call-out min/max. This is fiddly to fill in and doesn't match how a HIIT
circuit actually works. Separately, the builder's exercise search is a
bare-name list with no previews, duplicating (worse) the Library screen's
search that already shows thumbnails.

## Goal

1. Move timing to **workout-level "main settings"**: one work time, one
   rest-between-exercises time, one set count, and one reaction call-out
   interval for the whole workout. Drop per-exercise timing entirely.
2. Make the builder's exercise search **reuse the Library's search
   component**, including image previews.

## Model: the circuit

A workout is: a name, four global settings, and an **ordered list of
exercises**. Playing it means running through the whole list once (each
exercise for `workSecs`, resting `restSecs` between them), then repeating
the circuit `sets` times.

- **Rounds is removed.** It was the per-exercise repeat count; repeating
  the whole circuit `sets` times replaces it.
- **Rest is uniform between exercises.** Rest follows every exercise except
  the very last one of the entire workout. Example — exercises A, B, C with
  2 sets:

  ```
  A ▸ rest ▸ B ▸ rest ▸ C ▸ rest
  A ▸ rest ▸ B ▸ rest ▸ C
  (no trailing rest at the end)
  ```

  If `restSecs <= 0`, no rest steps are emitted at all.
- **Reaction cadence is one workout-level setting.** A single call-out
  min/max applies to every reaction-type exercise in the workout.

## Breaking change

This replaces the old per-block timing model. Workouts created under the
old builder lose their custom per-exercise timings — surviving rows fall
back to the new workout-level defaults. The live DB holds only throwaway
test workouts, so this is acceptable; no data migration of old timings.

## Components

### 1. Data model — migration `0005`

`workouts` gains timing columns; `workout_blocks` loses them.

- **`workouts`** — add:
  - `work_secs int not null default 30`
  - `rest_secs int not null default 10`
  - `sets int not null default 1`
  - `reaction_min_secs int` (nullable)
  - `reaction_max_secs int` (nullable)
- **`workout_blocks`** — drop: `work_secs`, `rest_secs`, `rounds`, `sets`,
  `reaction_min_secs`, `reaction_max_secs`. A block is now
  `(id, workout_id, "order", exercise_id)` — an ordered slot in the circuit.

Existing rows: the added `workouts` columns take their defaults; the
dropped `workout_blocks` columns are discarded. Applied via the Management
API `POST /v1/projects/<ref>/database/query` path (direct DB host doesn't
resolve in this env); the migration file remains the reproducible source
of truth.

### 2. Engine — `src/lib/workout-engine.ts`

This is the one change to the pure core. New signature:

```ts
export type WorkoutSettings = {
  workSecs: number;
  restSecs: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
};

export function flattenWorkout(
  exercises: EngineExercise[],
  settings: WorkoutSettings,
): WorkoutStep[];
```

- `BlockDef` is removed. `flattenWorkout` takes a flat exercise list plus
  the settings object.
- **Semantics:** for `set` in 1..`sets`, for each exercise in order, push a
  `work` step (`durationSecs = workSecs`), then a `rest` step
  (`durationSecs = restSecs`) — except suppress the single trailing rest at
  the very end of the whole workout, and suppress all rest when
  `restSecs <= 0`.
- **`WorkoutStep` work variant:** keep `exercise`, `durationSecs`, `set`,
  `totalSets`, `reaction`. **Remove `round` and `totalRounds`.** The `rest`
  variant is unchanged.
- **Reaction:** a work step's `reaction` is
  `{ minSecs, maxSecs }` when `exercise.type === "reaction"` and both
  workout-level `reactionMinSecs`/`reactionMaxSecs` are non-null; otherwise
  `null`.
- `totalDurationSecs(steps)` is unchanged.

### 3. Shared search component — `src/components/ExercisePicker.tsx` (new)

Extract the Library screen's search-box-plus-thumbnail-list into one
component:

```ts
type ExercisePickerProps = {
  onSelect: (exercise: CatalogExercise) => void;
};
```

- Owns local `search` state, runs `listExercises({ search })` in a
  `useEffect` keyed on `search`, renders a `FlatList` whose row is the
  64×64 `expo-image` thumbnail (`item.mediaUrl`, `contentFit="cover"`) plus
  the name — the exact row the Library already renders.
- Calls `onSelect(item)` when a row is tapped.
- **Library** (`library.tsx`) renders `<ExercisePicker>` for browsing
  (its `onSelect` can be a no-op or a detail nav — keep current behavior:
  Library today just lists, so `onSelect` is a no-op there).
- **Builder** renders the same `<ExercisePicker>` to append an exercise to
  the circuit.

### 4. Builder — `src/app/(app)/builder.tsx`

- **Main settings** at top: name field + four numeric fields — work secs,
  rest-between secs, sets, and reaction call-out min/max (shown always;
  applies to any reaction exercises added). Reuse the existing `numField`
  helper.
- **Exercises** section: `<ExercisePicker onSelect={addExercise} />` plus a
  reorderable/removable ordered list below (name + thumbnail, move up /
  move down / remove). No per-exercise numeric fields.
- Live total duration recomputed via the new `flattenWorkout(exercises,
  settings)` signature.
- `save` builds `createWorkout({ name, workSecs, restSecs, sets,
  reactionMinSecs, reactionMaxSecs, exerciseIds })`.

### 5. Persistence — `src/lib/workouts.ts`

- **`createWorkout`** new input:

  ```ts
  {
    name: string;
    workSecs: number;
    restSecs: number;
    sets: number;
    reactionMinSecs?: number | null;
    reactionMaxSecs?: number | null;
    exerciseIds: string[];
  }
  ```

  Writes settings onto the `workouts` row (owner_id still stamped from
  `auth.getUser`, never the client); inserts blocks as bare
  `{ workout_id, order, exercise_id }`.
- **`getWorkout`** returns:

  ```ts
  type WorkoutDetail = {
    id: string;
    name: string;
    settings: WorkoutSettings;
    exercises: EngineExercise[]; // sorted by block order
  };
  ```

  `NewBlock` type is removed.

### 6. Player — `src/app/(app)/player/[id].tsx`

- Call `flattenWorkout(detail.exercises, detail.settings)`.
- Drop the now-removed `round` / `totalRounds` from any step display.
- Everything else (countdown, beep, TTS, reaction driver, pause/skip/back,
  complete/empty states) is unchanged.

## Testing

- **Engine:** rewrite unit tests for the circuit + uniform-rest semantics —
  trailing-rest suppression, `restSecs <= 0` suppression, `sets`
  repetition, reaction min/max applied to reaction exercises only.
- **`workouts.ts`:** update column-mapping tests for the new `workouts`
  columns and bare `workout_blocks` rows; assert `createWorkout` writes the
  settings and `getWorkout` maps them back.
- **Builder:** update for main-settings fields + `ExercisePicker` (the
  FlatList timer-flush gotcha still applies — a synchronous state change is
  needed before list items are queryable).
- Same jest invocation:
  `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`.

## Out of scope

Editing existing workouts, History, recorded-voice call-outs — all remain
deferred as before.
