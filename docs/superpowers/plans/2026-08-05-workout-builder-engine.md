# Workout Builder + Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user build custom interval workouts (pick exercises, set work/rest/rounds/sets, order blocks), save them to Supabase, list and delete them — backed by a pure, unit-tested engine that flattens a workout into a timed step sequence.

**Architecture:** Two cleanly separable units, per the design spec §7. (1) A **pure engine** (`src/lib/workout-engine.ts`) — no UI, no network — that flattens block definitions into an ordered list of timed steps, expanding rounds/sets and inserting rest between every work interval except the last of each block. (2) A **persistence + UI layer**: a `src/lib/workouts.ts` read/write module (mirrors the existing `catalog.ts`), a workouts-list screen, and a builder screen. The engine is consumed now by the builder (live total-duration preview) and again by the Player in the next plan.

**Tech Stack:** Expo SDK 57 (React Native + RN Web, expo-router), TypeScript, Supabase JS client, Jest + `@testing-library/react-native`.

## Global Constraints

- **`owner_id` is set from the authenticated user, never from client input.** `workouts.owner_id` is `not null` and RLS enforces `owner_id = auth.uid()`. Reads come from `supabase.auth.getUser()`.
- **The engine is pure.** `src/lib/workout-engine.ts` imports nothing from `supabase`, React, or expo. It takes plain data in and returns plain data out. This is what makes it unit-testable and reusable by the Player.
- **No new migration.** The `workouts` and `workout_blocks` tables and their RLS policies already exist (`supabase/migrations/0001_init.sql`); grants exist (`0003_api_grants.sql`). This plan writes only TypeScript.
- **Never re-host exercise media.** Blocks reference exercises by id; any media shown is the hotlinked `mediaUrl` already in the catalog. Do not copy media.
- **Match existing style:** inline styles as in `library.tsx`; lib modules shaped like `catalog.ts` (map snake_case DB rows → camelCase); tests shaped like `catalog.test.ts` (mock-builder) and `library.test.tsx` (RTL).
- **`--legacy-peer-deps`** governs installs (already in `.npmrc`); no new dependencies are added by this plan.
- **Rest semantics (locked decision):** rest is intra-block only. Within a block, a rest step (`restSecs`) follows every work interval **except the last work interval of that block**. There is no rest between blocks. A block with `restSecs <= 0` emits no rest steps. This reproduces the spec's example exactly (`JJ,rest,JJ,rest,JJ, Swing,rest,Swing`).
- **Scope decision:** this plan delivers create / list / delete of workouts. **Editing an existing workout is deferred** (delete + rebuild works for v1); do not build an edit flow. Viewing a saved workout's block detail and running it belong to the Player plan — `getWorkout` is NOT built here (no consumer yet; would be speculative).

---

## File Structure

- `src/lib/workout-engine.ts` (new) — pure flatten logic + duration helper. No imports from supabase/React/expo.
- `src/lib/__tests__/workout-engine.test.ts` (new) — engine unit tests.
- `src/lib/workouts.ts` (new) — Supabase read/write for workouts + blocks. Mirrors `catalog.ts`.
- `src/lib/__tests__/workouts.test.ts` (new) — mock-builder tests.
- `src/app/(app)/workouts.tsx` (new) — list saved workouts, delete, link to builder.
- `src/app/__tests__/workouts.test.tsx` (new) — RTL test.
- `src/app/(app)/builder.tsx` (new) — build + save a workout.
- `src/app/__tests__/builder.test.tsx` (new) — RTL test.
- `src/app/(app)/index.tsx` (modify) — add a link to the workouts screen.

---

## Task 1: Workout Engine (pure logic)

**Files:**
- Create: `src/lib/workout-engine.ts`
- Test: `src/lib/__tests__/workout-engine.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type EngineExercise = { id: string; name: string; type: "standard" | "reaction"; mediaUrl: string | null; config: Record<string, unknown> }`
  - `type BlockDef = { exercise: EngineExercise; workSecs: number; restSecs: number; rounds: number; sets: number; reactionMinSecs?: number | null; reactionMaxSecs?: number | null }`
  - `type WorkoutStep = { kind: "work"; exercise: EngineExercise; durationSecs: number; round: number; totalRounds: number; set: number; totalSets: number; reaction: { minSecs: number; maxSecs: number } | null } | { kind: "rest"; durationSecs: number }`
  - `function flattenWorkout(blocks: BlockDef[]): WorkoutStep[]`
  - `function totalDurationSecs(steps: WorkoutStep[]): number`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/workout-engine.test.ts
import {
  flattenWorkout,
  totalDurationSecs,
  type BlockDef,
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

const block = (over: Partial<BlockDef> = {}): BlockDef => ({
  exercise: standard,
  workSecs: 30,
  restSecs: 10,
  rounds: 1,
  sets: 1,
  ...over,
});

test("inserts rest between rounds but never after the last round", () => {
  const steps = flattenWorkout([block({ rounds: 3 })]);
  expect(steps.map((s) => s.kind)).toEqual([
    "work",
    "rest",
    "work",
    "rest",
    "work",
  ]);
});

test("a single work interval produces no rest", () => {
  const steps = flattenWorkout([block({ rounds: 1, sets: 1 })]);
  expect(steps.map((s) => s.kind)).toEqual(["work"]);
});

test("skips rest steps when restSecs is 0", () => {
  const steps = flattenWorkout([block({ rounds: 3, restSecs: 0 })]);
  expect(steps.map((s) => s.kind)).toEqual(["work", "work", "work"]);
});

test("expands sets x rounds and rests between all but the last work", () => {
  const steps = flattenWorkout([block({ rounds: 2, sets: 2 })]);
  // 4 works, 3 rests, no trailing rest
  expect(steps.map((s) => s.kind)).toEqual([
    "work",
    "rest",
    "work",
    "rest",
    "work",
    "rest",
    "work",
  ]);
  const works = steps.filter((s) => s.kind === "work");
  expect(works.map((w: any) => [w.set, w.round])).toEqual([
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2],
  ]);
});

test("does not insert rest between separate blocks", () => {
  const steps = flattenWorkout([
    block({ exercise: standard, rounds: 3, restSecs: 10 }),
    block({ exercise: reaction, rounds: 2, restSecs: 15, workSecs: 40 }),
  ]);
  expect(steps.map((s) => s.kind)).toEqual([
    "work", "rest", "work", "rest", "work", // block 1
    "work", "rest", "work",                 // block 2 — starts with work, no bridging rest
  ]);
});

test("carries reaction range on reaction work steps and null otherwise", () => {
  const steps = flattenWorkout([
    block({ exercise: standard }),
    block({
      exercise: reaction,
      reactionMinSecs: 2,
      reactionMaxSecs: 5,
    }),
  ]);
  const works = steps.filter((s) => s.kind === "work") as any[];
  expect(works[0].reaction).toBeNull();
  expect(works[1].reaction).toEqual({ minSecs: 2, maxSecs: 5 });
});

test("totalDurationSecs sums every step", () => {
  const steps = flattenWorkout([block({ rounds: 3, workSecs: 30, restSecs: 10 })]);
  // 3*30 + 2*10
  expect(totalDurationSecs(steps)).toBe(110);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest workout-engine`
Expected: FAIL — `Cannot find module '../workout-engine'`.

- [ ] **Step 3: Write the engine**

```ts
// src/lib/workout-engine.ts
export type EngineExercise = {
  id: string;
  name: string;
  type: "standard" | "reaction";
  mediaUrl: string | null;
  config: Record<string, unknown>;
};

export type BlockDef = {
  exercise: EngineExercise;
  workSecs: number;
  restSecs: number;
  rounds: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
};

export type WorkoutStep =
  | {
      kind: "work";
      exercise: EngineExercise;
      durationSecs: number;
      round: number;
      totalRounds: number;
      set: number;
      totalSets: number;
      reaction: { minSecs: number; maxSecs: number } | null;
    }
  | { kind: "rest"; durationSecs: number };

// Flatten a workout into an ordered list of timed steps.
// Rest is intra-block: it follows every work interval except the last of the
// block, and is omitted entirely when restSecs <= 0. No rest bridges blocks.
export function flattenWorkout(blocks: BlockDef[]): WorkoutStep[] {
  const steps: WorkoutStep[] = [];

  for (const block of blocks) {
    const works: WorkoutStep[] = [];
    for (let set = 1; set <= block.sets; set++) {
      for (let round = 1; round <= block.rounds; round++) {
        works.push({
          kind: "work",
          exercise: block.exercise,
          durationSecs: block.workSecs,
          round,
          totalRounds: block.rounds,
          set,
          totalSets: block.sets,
          reaction:
            block.exercise.type === "reaction" &&
            block.reactionMinSecs != null &&
            block.reactionMaxSecs != null
              ? { minSecs: block.reactionMinSecs, maxSecs: block.reactionMaxSecs }
              : null,
        });
      }
    }

    works.forEach((work, i) => {
      steps.push(work);
      const isLastOfBlock = i === works.length - 1;
      if (!isLastOfBlock && block.restSecs > 0) {
        steps.push({ kind: "rest", durationSecs: block.restSecs });
      }
    });
  }

  return steps;
}

export function totalDurationSecs(steps: WorkoutStep[]): number {
  return steps.reduce((sum, s) => sum + s.durationSecs, 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest workout-engine`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workout-engine.ts src/lib/__tests__/workout-engine.test.ts
git commit -m "feat: pure workout engine that flattens blocks into timed steps"
```

---

## Task 2: Workout persistence library

**Files:**
- Create: `src/lib/workouts.ts`
- Test: `src/lib/__tests__/workouts.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (`.from`, `.insert`, `.select`, `.single`, `.eq`, `.delete`, `.order`, and `supabase.auth.getUser()`).
- Produces:
  - `type WorkoutSummary = { id: string; name: string; createdAt: string }`
  - `type NewBlock = { exerciseId: string; workSecs: number; restSecs: number; rounds: number; sets: number; reactionMinSecs?: number | null; reactionMaxSecs?: number | null }`
  - `function listWorkouts(): Promise<WorkoutSummary[]>`
  - `function createWorkout(input: { name: string; blocks: NewBlock[] }): Promise<string>` — returns the new workout id
  - `function deleteWorkout(id: string): Promise<void>`

**Note:** `workout_blocks."order"` is a reserved word, quoted in the schema. The Supabase client sends it as a plain JSON key `order`; PostgREST maps it to the column — no client-side quoting needed. Blocks are inserted with `order` = their array index. `createWorkout` inserts the workout row first (needs its id for the blocks), then the blocks; a partial failure could orphan a workout row — accepted v1 limitation, not handled here.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/workouts.test.ts
// A chainable mock builder. Each method returns the builder; terminal calls
// resolve via `then` or return canned values. `capture` records insert payloads.
const state: any = { inserted: [], listRows: [], deletedEq: null };

jest.mock("../supabase", () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.order = jest.fn(() => builder);
  builder.single = jest.fn(() =>
    Promise.resolve({ data: { id: "w1" }, error: null }),
  );
  builder.eq = jest.fn((_col: string, val: string) => {
    state.deletedEq = val;
    return Promise.resolve({ error: null });
  });
  builder.delete = jest.fn(() => builder);
  builder.insert = jest.fn((payload: any) => {
    state.inserted.push(payload);
    return builder; // allow .select().single() to chain after insert
  });
  // Thenable so `await supabase.from(...).select(...).order(...)` resolves.
  builder.then = (resolve: any) =>
    resolve({ data: state.listRows, error: null });

  return {
    supabase: {
      __builder: builder,
      from: jest.fn(() => builder),
      auth: {
        getUser: jest.fn(() =>
          Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
        ),
      },
    },
  };
});

import { listWorkouts, createWorkout, deleteWorkout } from "../workouts";
import { supabase } from "../supabase";

beforeEach(() => {
  state.inserted = [];
  state.listRows = [];
  state.deletedEq = null;
  jest.clearAllMocks();
});

test("listWorkouts maps rows to summaries", async () => {
  state.listRows = [
    { id: "w1", name: "Padel HIIT", created_at: "2026-08-05T00:00:00Z" },
  ];
  const out = await listWorkouts();
  expect(out).toEqual([
    { id: "w1", name: "Padel HIIT", createdAt: "2026-08-05T00:00:00Z" },
  ]);
  expect((supabase as any).from).toHaveBeenCalledWith("workouts");
});

test("createWorkout stamps owner_id from the authed user and returns the id", async () => {
  const id = await createWorkout({ name: "My WOD", blocks: [] });
  expect(id).toBe("w1");
  // First insert is the workout row, carrying owner_id from getUser().
  expect(state.inserted[0]).toEqual({ name: "My WOD", owner_id: "user-1" });
});

test("createWorkout inserts blocks with order index and mapped columns", async () => {
  await createWorkout({
    name: "My WOD",
    blocks: [
      { exerciseId: "e1", workSecs: 30, restSecs: 10, rounds: 3, sets: 1 },
      {
        exerciseId: "e2",
        workSecs: 40,
        restSecs: 15,
        rounds: 2,
        sets: 1,
        reactionMinSecs: 2,
        reactionMaxSecs: 5,
      },
    ],
  });
  // Second insert is the blocks array.
  expect(state.inserted[1]).toEqual([
    {
      workout_id: "w1",
      order: 0,
      exercise_id: "e1",
      work_secs: 30,
      rest_secs: 10,
      rounds: 3,
      sets: 1,
      reaction_min_secs: null,
      reaction_max_secs: null,
    },
    {
      workout_id: "w1",
      order: 1,
      exercise_id: "e2",
      work_secs: 40,
      rest_secs: 15,
      rounds: 2,
      sets: 1,
      reaction_min_secs: 2,
      reaction_max_secs: 5,
    },
  ]);
});

test("createWorkout throws when not signed in", async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
    data: { user: null },
    error: null,
  });
  await expect(createWorkout({ name: "x", blocks: [] })).rejects.toThrow(
    "Not signed in",
  );
});

test("deleteWorkout filters by id", async () => {
  await deleteWorkout("w1");
  expect((supabase as any).__builder.delete).toHaveBeenCalled();
  expect(state.deletedEq).toBe("w1");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest workouts.test`
Expected: FAIL — `Cannot find module '../workouts'`.

- [ ] **Step 3: Write the library**

```ts
// src/lib/workouts.ts
import { supabase } from "./supabase";

export type WorkoutSummary = {
  id: string;
  name: string;
  createdAt: string;
};

export type NewBlock = {
  exerciseId: string;
  workSecs: number;
  restSecs: number;
  rounds: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
};

export async function listWorkouts(): Promise<WorkoutSummary[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
  }));
}

export async function createWorkout(input: {
  name: string;
  blocks: NewBlock[];
}): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Not signed in");

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({ name: input.name, owner_id: ownerId })
    .select("id")
    .single();
  if (wErr) throw wErr;

  const rows = input.blocks.map((b, i) => ({
    workout_id: workout.id,
    order: i,
    exercise_id: b.exerciseId,
    work_secs: b.workSecs,
    rest_secs: b.restSecs,
    rounds: b.rounds,
    sets: b.sets,
    reaction_min_secs: b.reactionMinSecs ?? null,
    reaction_max_secs: b.reactionMaxSecs ?? null,
  }));

  if (rows.length > 0) {
    const { error: bErr } = await supabase.from("workout_blocks").insert(rows);
    if (bErr) throw bErr;
  }

  return workout.id;
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest workouts.test`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workouts.ts src/lib/__tests__/workouts.test.ts
git commit -m "feat: workouts persistence lib (list, create with blocks, delete)"
```

---

## Task 3: Workouts list screen

**Files:**
- Create: `src/app/(app)/workouts.tsx`
- Modify: `src/app/(app)/index.tsx` — add a `<Link href="/workouts">My workouts</Link>`
- Test: `src/app/__tests__/workouts.test.tsx`

**Interfaces:**
- Consumes: `listWorkouts`, `deleteWorkout`, `WorkoutSummary` from `src/lib/workouts.ts`; `Link`, `useFocusEffect` from `expo-router`.
- Produces: default-exported `Workouts` screen at route `/workouts`.

**Note:** Use `useFocusEffect` so the list refreshes when the user returns from the builder after saving. In tests it is mocked to run once on mount.

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/workouts.test.tsx
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-router", () => ({
  Link: ({ children }: any) => children,
  useFocusEffect: (cb: any) => React.useEffect(cb, []),
}));

const mockList = jest.fn();
const mockDelete = jest.fn().mockResolvedValue(undefined);
jest.mock("../../lib/workouts", () => ({
  listWorkouts: (...a: any[]) => mockList(...a),
  deleteWorkout: (...a: any[]) => mockDelete(...a),
}));

import Workouts from "../(app)/workouts";

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockResolvedValue([
    { id: "w1", name: "Padel HIIT", createdAt: "2026-08-05T00:00:00Z" },
  ]);
});

test("shows saved workouts", async () => {
  const { getByText } = await render(<Workouts />);
  await waitFor(() => expect(getByText("Padel HIIT")).toBeTruthy());
});

test("deletes a workout and refreshes the list", async () => {
  const { getByText, getAllByText } = await render(<Workouts />);
  await waitFor(() => expect(getByText("Padel HIIT")).toBeTruthy());
  fireEvent.press(getAllByText("Delete")[0]);
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith("w1"));
  // list is re-fetched after delete (once on focus, once after delete)
  expect(mockList.mock.calls.length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest app/__tests__/workouts.test`
Expected: FAIL — `Cannot find module '../(app)/workouts'`.

- [ ] **Step 3: Write the screen**

```tsx
// src/app/(app)/workouts.tsx
import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { Link, useFocusEffect } from "expo-router";
import {
  listWorkouts,
  deleteWorkout,
  type WorkoutSummary,
} from "../../lib/workouts";

export default function Workouts() {
  const [items, setItems] = useState<WorkoutSummary[]>([]);

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
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Link href="/builder" style={{ fontSize: 16, color: "#2563eb" }}>
        + New workout
      </Link>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 16 }}>{item.name}</Text>
            <Pressable onPress={() => remove(item.id)} style={{ padding: 6 }}>
              <Text style={{ color: "#dc2626" }}>Delete</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}
```

- [ ] **Step 4: Add the home link**

In `src/app/(app)/index.tsx`, add a link beside the existing "Browse exercises" link:

```tsx
      <Link href="/workouts" style={{ fontSize: 16, color: "#2563eb" }}>
        My workouts
      </Link>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest app/__tests__/workouts.test`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/workouts.tsx" "src/app/(app)/index.tsx" src/app/__tests__/workouts.test.tsx
git commit -m "feat: workouts list screen with delete, linked from home"
```

---

## Task 4: Workout builder screen

**Files:**
- Create: `src/app/(app)/builder.tsx`
- Test: `src/app/__tests__/builder.test.tsx`

**Interfaces:**
- Consumes: `listExercises`, `CatalogExercise` from `src/lib/catalog.ts`; `createWorkout`, `NewBlock` from `src/lib/workouts.ts`; `flattenWorkout`, `totalDurationSecs` from `src/lib/workout-engine.ts`; `useRouter` from `expo-router`.
- Produces: default-exported `Builder` screen at route `/builder`.

**Behavior:** name field; a searchable exercise picker (reuses `listExercises`) that appends a block with default timings (work 30, rest 10, rounds 3, sets 1); per-block numeric fields for work/rest/rounds/sets (and reaction min/max when the picked exercise is `type === "reaction"`); reorder with up/down; remove a block; a live total-duration line computed via the engine; Save calls `createWorkout` then `router.replace("/workouts")`. Save is disabled (guarded) when the name is empty or there are no blocks.

**Reorder decision:** up/down buttons, not drag-and-drop (drag-and-drop is a heavy dependency and not warranted for v1).

- [ ] **Step 1: Write the failing test**

```tsx
// src/app/__tests__/builder.test.tsx
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import React from "react";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));

const mockListExercises = jest.fn().mockResolvedValue([
  {
    id: "e1",
    name: "Push Up",
    type: "standard",
    source: "exercisedb",
    mediaUrl: null,
    config: {},
  },
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

test("builds a workout from a picked exercise and saves it", async () => {
  const { getByText, getByPlaceholderText } = await render(<Builder />);

  // name the workout
  fireEvent.changeText(getByPlaceholderText("Workout name"), "Morning WOD");

  // pick the exercise from the catalog list -> appends a block
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  await act(async () => {
    fireEvent.press(getByText("Push Up"));
  });

  // save
  await act(async () => {
    fireEvent.press(getByText("Save"));
  });

  await waitFor(() =>
    expect(mockCreate).toHaveBeenCalledWith({
      name: "Morning WOD",
      blocks: [
        {
          exerciseId: "e1",
          workSecs: 30,
          restSecs: 10,
          rounds: 3,
          sets: 1,
          reactionMinSecs: null,
          reactionMaxSecs: null,
        },
      ],
    }),
  );
  expect(mockReplace).toHaveBeenCalledWith("/workouts");
});

test("does not save when the workout has no blocks", async () => {
  const { getByText, getByPlaceholderText } = await render(<Builder />);
  fireEvent.changeText(getByPlaceholderText("Workout name"), "Empty");
  await act(async () => {
    fireEvent.press(getByText("Save"));
  });
  expect(mockCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest app/__tests__/builder.test`
Expected: FAIL — `Cannot find module '../(app)/builder'`.

- [ ] **Step 3: Write the screen**

```tsx
// src/app/(app)/builder.tsx
import { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { listExercises, type CatalogExercise } from "../../lib/catalog";
import { createWorkout, type NewBlock } from "../../lib/workouts";
import {
  flattenWorkout,
  totalDurationSecs,
  type BlockDef,
} from "../../lib/workout-engine";

type BuilderBlock = NewBlock & { exercise: CatalogExercise };

const DEFAULTS = { workSecs: 30, restSecs: 10, rounds: 3, sets: 1 };

export default function Builder() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [blocks, setBlocks] = useState<BuilderBlock[]>([]);
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<CatalogExercise[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listExercises({ search })
      .then((r) => active && setCatalog(r))
      .catch(() => active && setCatalog([]));
    return () => {
      active = false;
    };
  }, [search]);

  const addBlock = (ex: CatalogExercise) => {
    setBlocks((b) => [
      ...b,
      {
        exercise: ex,
        exerciseId: ex.id,
        ...DEFAULTS,
        reactionMinSecs: ex.type === "reaction" ? 2 : null,
        reactionMaxSecs: ex.type === "reaction" ? 5 : null,
      },
    ]);
  };

  const patch = (i: number, field: keyof NewBlock, value: number) => {
    setBlocks((b) => b.map((blk, j) => (j === i ? { ...blk, [field]: value } : blk)));
  };

  const move = (i: number, dir: -1 | 1) => {
    setBlocks((b) => {
      const j = i + dir;
      if (j < 0 || j >= b.length) return b;
      const next = [...b];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const remove = (i: number) => setBlocks((b) => b.filter((_, j) => j !== i));

  const save = async () => {
    if (!name.trim() || blocks.length === 0) {
      setError("Name your workout and add at least one exercise.");
      return;
    }
    const payload = {
      name: name.trim(),
      blocks: blocks.map((b) => ({
        exerciseId: b.exerciseId,
        workSecs: b.workSecs,
        restSecs: b.restSecs,
        rounds: b.rounds,
        sets: b.sets,
        reactionMinSecs: b.reactionMinSecs ?? null,
        reactionMaxSecs: b.reactionMaxSecs ?? null,
      })),
    };
    try {
      await createWorkout(payload);
      router.replace("/workouts");
    } catch (e: any) {
      setError(e?.message ?? "Could not save.");
    }
  };

  const defs: BlockDef[] = blocks.map((b) => ({
    exercise: {
      id: b.exercise.id,
      name: b.exercise.name,
      type: b.exercise.type,
      mediaUrl: b.exercise.mediaUrl,
      config: b.exercise.config,
    },
    workSecs: b.workSecs,
    restSecs: b.restSecs,
    rounds: b.rounds,
    sets: b.sets,
    reactionMinSecs: b.reactionMinSecs,
    reactionMaxSecs: b.reactionMaxSecs,
  }));
  const total = totalDurationSecs(flattenWorkout(defs));

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

      <Text style={{ fontWeight: "600" }}>
        Blocks ({blocks.length}) — total {Math.floor(total / 60)}:
        {String(total % 60).padStart(2, "0")}
      </Text>

      {blocks.map((b, i) => (
        <View
          key={`${b.exerciseId}-${i}`}
          style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, gap: 8 }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 16 }}>{b.exercise.name}</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable onPress={() => move(i, -1)}><Text>↑</Text></Pressable>
              <Pressable onPress={() => move(i, 1)}><Text>↓</Text></Pressable>
              <Pressable onPress={() => remove(i)}><Text style={{ color: "#dc2626" }}>✕</Text></Pressable>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {numField("Work s", b.workSecs, (n) => patch(i, "workSecs", n))}
            {numField("Rest s", b.restSecs, (n) => patch(i, "restSecs", n))}
            {numField("Rounds", b.rounds, (n) => patch(i, "rounds", n))}
            {numField("Sets", b.sets, (n) => patch(i, "sets", n))}
            {b.exercise.type === "reaction" ? (
              <>
                {numField("React min", b.reactionMinSecs ?? 0, (n) => patch(i, "reactionMinSecs", n))}
                {numField("React max", b.reactionMaxSecs ?? 0, (n) => patch(i, "reactionMaxSecs", n))}
              </>
            ) : null}
          </View>
        </View>
      ))}

      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}

      <Pressable onPress={save} style={{ backgroundColor: "#222", padding: 14, borderRadius: 8 }}>
        <Text style={{ color: "white", textAlign: "center" }}>Save</Text>
      </Pressable>

      <Text style={{ fontWeight: "600", marginTop: 8 }}>Add an exercise</Text>
      <TextInput
        placeholder="Search exercises"
        autoCapitalize="none"
        value={search}
        onChangeText={setSearch}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <FlatList
        data={catalog}
        scrollEnabled={false}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <Pressable onPress={() => addBlock(item)} style={{ paddingVertical: 10 }}>
            <Text style={{ fontSize: 16, color: "#2563eb" }}>{item.name}</Text>
          </Pressable>
        )}
      />
    </ScrollView>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest app/__tests__/builder.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx jest && npx tsc --noEmit`
Expected: all tests PASS (prior 32 + 16 new = 48), tsc clean.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/builder.tsx" src/app/__tests__/builder.test.tsx
git commit -m "feat: workout builder screen (pick exercises, set timings, reorder, save)"
```

---

## Self-Review

**1. Spec coverage** (design §2 v1 "Build custom HIIT/interval workouts: work time, rest time, rounds, sets, exercise selection, ordering"):
- Work/rest/rounds/sets per block → Task 4 numeric fields; persisted by Task 2. ✓
- Exercise selection → Task 4 picker reusing `listExercises`. ✓
- Ordering → Task 4 up/down reorder, persisted as `order` index. ✓
- Engine flattening (design §7) with correct rest handling and no trailing rest → Task 1. ✓
- Reaction block timing fields (`reaction_min_secs`/`reaction_max_secs`) persisted → Tasks 2 & 4 (driver itself is the next plan). ✓
- Cloud persistence + owner scoping via existing RLS → Task 2. ✓
- Deferred by explicit scope decision: editing existing workouts, viewing/running saved workouts (`getWorkout`, Player) — next plan.

**2. Placeholder scan:** No TBD/TODO; every code step contains complete, runnable code and exact test assertions.

**3. Type consistency:** `NewBlock` (Task 2) is the save payload shape used verbatim in Task 4's `createWorkout` call and its test assertion. `CatalogExercise` (existing `catalog.ts`) maps cleanly onto the engine's `EngineExercise` in Task 4. `BlockDef`/`WorkoutStep`/`flattenWorkout`/`totalDurationSecs` names match between Task 1's definition and Task 4's usage. `WorkoutSummary` shape matches between Task 2 and Task 3. Route names (`/workouts`, `/builder`) are consistent across Tasks 3 and 4 and the home link.
