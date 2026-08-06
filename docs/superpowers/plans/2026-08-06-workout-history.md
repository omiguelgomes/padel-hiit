# Workout History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every completed workout run as an immutable, self-contained session; list past sessions; let the user Repeat any of them; and add an Exit control to the Player.

**Architecture:** History is fully decoupled from `workouts` — a session is a versioned JSON snapshot (name + settings + full exercise list) stored in `workout_history`, replayable with zero DB reads via the existing `flattenWorkout`. Repeat hands a snapshot to the Player through a tiny in-memory pending-run store (no URL serialization). The Player records on the finish transition only; Exit and early quits record nothing.

**Tech Stack:** Expo (React Native + RN Web), expo-router, Supabase (Postgres + PostgREST + RLS), TypeScript, Jest.

## Global Constraints

- `npm install` requires `--legacy-peer-deps` (already set via `.npmrc`).
- Run the real test suite with: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`.
- `owner_id` is always stamped server-side from `auth.getUser()`, never client-supplied (matches `createWorkout`).
- No new dependencies.
- Migrations are the reproducible source of truth; applying `0008` to live Supabase (ref `ppgjvqoutuxwhvhyaqhj`) is a deferred manual step via Management API `POST /v1/projects/<ref>/database/query` (needs `SUPABASE_ACCESS_TOKEN`) — app code and tests work regardless.
- Snapshot format carries `version: 1`.
- New library logic lives in pure modules with unit tests; no new Player-screen render tests (documented FlatList/timer flakiness).

---

### Task 1: Migration 0008 — decouple history from workouts

**Files:**
- Create: `supabase/migrations/0008_history_decouple.sql`
- Test: `supabase/migrations/__tests__/schema-0008.test.ts`

**Interfaces:**
- Consumes: existing `workout_history` table (`0001`) with a `workout_id uuid references workouts(id) on delete set null` column.
- Produces: `workout_history` shape `id, owner_id, completed_at, settings_snapshot` (no `workout_id`). No app-code interface.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/__tests__/schema-0008.test.ts`:
```ts
import { readFileSync } from "fs";
import { join } from "path";

const raw = readFileSync(join(__dirname, "..", "0008_history_decouple.sql"), "utf8");
const sql = raw.toLowerCase();

test("drops the workout_id column from workout_history", () => {
  expect(sql).toContain("alter table workout_history");
  expect(sql).toContain("drop column workout_id");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest schema-0008 --modulePathIgnorePatterns /.claude/`
Expected: FAIL — `ENOENT` (migration file does not exist yet).

- [ ] **Step 3: Write the migration**

`supabase/migrations/0008_history_decouple.sql`:
```sql
-- History is a self-contained session record, fully decoupled from workouts.
-- The soft link back to the source workout is removed; settings_snapshot is a
-- complete copy of the workout as run.
alter table workout_history
  drop column workout_id;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest schema-0008 --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_history_decouple.sql supabase/migrations/__tests__/schema-0008.test.ts
git commit -m "feat: migration 0008 — decouple workout_history from workouts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `run-session.ts` — in-memory pending-run store

**Files:**
- Create: `src/lib/run-session.ts`
- Test: `src/lib/__tests__/run-session.test.ts`

**Interfaces:**
- Consumes: `RunSnapshot` type (defined in Task 3). For this task, import the type from `./history`; Task 3 produces it. Implement Task 3 first if reading in order — but the store is type-only coupled, so either order compiles once both exist.
- Produces:
  - `setPendingRun(snapshot: RunSnapshot): void`
  - `takePendingRun(): RunSnapshot | null` — returns the pending snapshot and clears it (second call returns `null`).

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/run-session.test.ts`:
```ts
import { setPendingRun, takePendingRun } from "../run-session";
import type { RunSnapshot } from "../history";

const snap: RunSnapshot = {
  version: 1,
  name: "S",
  settings: { workSecs: 30, restSecs: 10, sets: 1, reactionMinSecs: null, reactionMaxSecs: null },
  exercises: [],
};

test("takePendingRun returns null when nothing is set", () => {
  expect(takePendingRun()).toBeNull();
});

test("setPendingRun then takePendingRun round-trips, and clears", () => {
  setPendingRun(snap);
  expect(takePendingRun()).toEqual(snap);
  expect(takePendingRun()).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest run-session --modulePathIgnorePatterns /.claude/`
Expected: FAIL — cannot find module `../run-session`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/run-session.ts`:
```ts
// In-memory hand-off for a run that isn't loaded from the DB (a repeated
// history session). Set by the History screen, taken by the Player. Cleared on
// read so a stale snapshot can't leak into a later normal run.
import type { RunSnapshot } from "./history";

let pending: RunSnapshot | null = null;

export function setPendingRun(snapshot: RunSnapshot): void {
  pending = snapshot;
}

export function takePendingRun(): RunSnapshot | null {
  const s = pending;
  pending = null;
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest run-session --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/run-session.ts src/lib/__tests__/run-session.test.ts
git commit -m "feat: in-memory pending-run store for repeat

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `history.ts` — snapshot type + persistence

**Files:**
- Create: `src/lib/history.ts`
- Test: `src/lib/__tests__/history.test.ts`

**Interfaces:**
- Consumes: `supabase` from `./supabase`; `WorkoutSettings`, `EngineExercise` from `./workout-engine`.
- Produces:
  - `type RunSnapshot = { version: 1; name: string; settings: WorkoutSettings; exercises: EngineExercise[] }`
  - `type HistoryEntry = { id: string; completedAt: string; snapshot: RunSnapshot }`
  - `recordCompletion(snapshot: RunSnapshot): Promise<void>` — inserts one row into `workout_history` with `owner_id` from `auth.getUser()` and `settings_snapshot: snapshot`. Throws if not signed in.
  - `listHistory(): Promise<HistoryEntry[]>` — selects `id, completed_at, settings_snapshot` ordered `completed_at desc`, maps to `HistoryEntry[]`.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/history.test.ts` (mirrors the `workouts.test.ts` chainable-mock style):
```ts
const state: any = { inserted: [], listRows: [] };

jest.mock("../supabase", () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.order = jest.fn(() => builder);
  builder.insert = jest.fn((payload: any) => {
    state.inserted.push(payload);
    return builder;
  });
  builder.then = (resolve: any) => resolve({ data: state.listRows, error: null });
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

import { recordCompletion, listHistory, type RunSnapshot } from "../history";
import { supabase } from "../supabase";

const snap: RunSnapshot = {
  version: 1,
  name: "Tuesday",
  settings: { workSecs: 30, restSecs: 10, sets: 2, reactionMinSecs: null, reactionMaxSecs: null },
  exercises: [{ id: "e1", name: "Volley", type: "reaction", mediaUrl: null, config: {} }],
};

beforeEach(() => {
  state.inserted = [];
  state.listRows = [];
  jest.clearAllMocks();
});

test("recordCompletion inserts a row stamped with the authed owner_id", async () => {
  await recordCompletion(snap);
  expect((supabase as any).from).toHaveBeenCalledWith("workout_history");
  expect(state.inserted[0]).toEqual({
    owner_id: "user-1",
    settings_snapshot: snap,
  });
});

test("recordCompletion throws when not signed in", async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
    data: { user: null },
    error: null,
  });
  await expect(recordCompletion(snap)).rejects.toThrow("Not signed in");
});

test("listHistory maps rows newest-first shape to HistoryEntry[]", async () => {
  state.listRows = [
    { id: "h1", completed_at: "2026-08-06T10:00:00Z", settings_snapshot: snap },
  ];
  const out = await listHistory();
  expect((supabase as any).from).toHaveBeenCalledWith("workout_history");
  expect((supabase as any).__builder.order).toHaveBeenCalledWith("completed_at", { ascending: false });
  expect(out).toEqual([
    { id: "h1", completedAt: "2026-08-06T10:00:00Z", snapshot: snap },
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest history --modulePathIgnorePatterns /.claude/`
Expected: FAIL — cannot find module `../history`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/history.ts`:
```ts
// src/lib/history.ts
// The only module that touches workout_history. A history entry is a
// self-contained session: an immutable snapshot of the workout as it was run,
// with no reference to the workouts table.
import { supabase } from "./supabase";
import type { WorkoutSettings, EngineExercise } from "./workout-engine";

export type RunSnapshot = {
  version: 1;
  name: string;
  settings: WorkoutSettings;
  exercises: EngineExercise[];
};

export type HistoryEntry = {
  id: string;
  completedAt: string;
  snapshot: RunSnapshot;
};

export async function recordCompletion(snapshot: RunSnapshot): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Not signed in");

  const { error } = await supabase.from("workout_history").insert({
    owner_id: ownerId,
    settings_snapshot: snapshot,
  });
  if (error) throw error;
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from("workout_history")
    .select("id, completed_at, settings_snapshot")
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    completedAt: r.completed_at,
    snapshot: r.settings_snapshot,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest history --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/history.ts src/lib/__tests__/history.test.ts
git commit -m "feat: workout history persistence (record + list)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `toSnapshot` mapper in `workouts.ts`

**Files:**
- Modify: `src/lib/workouts.ts` (add export at end)
- Test: `src/lib/__tests__/workouts.test.ts` (add cases)

**Interfaces:**
- Consumes: `WorkoutDetail` (already exported from `./workouts`), `RunSnapshot` from `./history`.
- Produces: `toSnapshot(detail: WorkoutDetail): RunSnapshot` — pure; drops `id`, sets `version: 1`, copies `name`, `settings`, `exercises` verbatim.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/workouts.test.ts`:
```ts
import { toSnapshot } from "../workouts";

test("toSnapshot maps a WorkoutDetail to a versioned snapshot, dropping id", () => {
  const detail = {
    id: "w1",
    name: "Padel HIIT",
    settings: { workSecs: 40, restSecs: 15, sets: 2, reactionMinSecs: 2, reactionMaxSecs: 5 },
    exercises: [
      { id: "e1", name: "Jumping Jacks", type: "standard" as const, mediaUrl: null, config: {} },
      { id: "e2", name: "Volley", type: "reaction" as const, mediaUrl: "https://x/v.mp4", config: { pool: [] } },
    ],
  };
  expect(toSnapshot(detail)).toEqual({
    version: 1,
    name: "Padel HIIT",
    settings: { workSecs: 40, restSecs: 15, sets: 2, reactionMinSecs: 2, reactionMaxSecs: 5 },
    exercises: detail.exercises,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest workouts.test --modulePathIgnorePatterns /.claude/`
Expected: FAIL — `toSnapshot` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/workouts.ts`:
```ts
import type { RunSnapshot } from "./history";

// Convert a loaded workout into a self-contained, immutable run snapshot.
export function toSnapshot(detail: WorkoutDetail): RunSnapshot {
  return {
    version: 1,
    name: detail.name,
    settings: detail.settings,
    exercises: detail.exercises,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest workouts.test --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workouts.ts src/lib/__tests__/workouts.test.ts
git commit -m "feat: toSnapshot maps a workout to a run snapshot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Player — snapshot load path, record-on-complete, Exit control

**Files:**
- Modify: `src/app/(app)/player/[id].tsx`

**Interfaces:**
- Consumes: `takePendingRun` from `../../../lib/run-session`; `recordCompletion` + `RunSnapshot` from `../../../lib/history`; `toSnapshot` from `../../../lib/workouts`; existing `getWorkout`, `flattenWorkout`.
- Produces: no new exports. Behavior: repeats run from the pending snapshot; a finished run inserts exactly one history row; Exit leaves without recording.

This task has no new unit test (screen render tests are excluded per Global Constraints). Verification is: full suite stays green + `expo export` builds clean. The logic it wires (`takePendingRun`, `recordCompletion`, `toSnapshot`) is unit-tested in Tasks 2–4.

- [ ] **Step 1: Add imports**

At the top of `src/app/(app)/player/[id].tsx`, add to the existing import block:
```ts
import { takePendingRun } from "../../../lib/run-session";
import { recordCompletion, type RunSnapshot } from "../../../lib/history";
import { toSnapshot } from "../../../lib/workouts";
```

- [ ] **Step 2: Hold the run's snapshot in a ref, and load from pending snapshot when present**

Add a ref alongside the existing `stepsRef` (near line 36):
```ts
const snapshotRef = useRef<RunSnapshot | null>(null);
const recordedRef = useRef(false);
```

Replace the load effect body (the `getWorkout(id).then(...)` block, ~lines 40–58) so a pending snapshot short-circuits the DB read:
```ts
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    let active = true;

    const pending = takePendingRun();
    if (pending) {
      snapshotRef.current = pending;
      const flat = flattenWorkout(pending.exercises, pending.settings);
      stepsRef.current = flat;
      setSteps(flat);
      setRemaining(flat[0]?.durationSecs ?? 0);
      setLoaded(true);
      if (flat.length > 0) announce(flat[0]);
      return () => {
        active = false;
        stopSpeaking();
      };
    }

    getWorkout(id)
      .then((w) => {
        if (!active) return;
        snapshotRef.current = toSnapshot(w);
        const flat = flattenWorkout(w.exercises, w.settings);
        stepsRef.current = flat;
        setSteps(flat);
        setRemaining(flat[0]?.durationSecs ?? 0);
        setLoaded(true);
        if (flat.length > 0) announce(flat[0]);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
      stopSpeaking();
    };
  }, [id]);
```

- [ ] **Step 3: Record the completed session exactly once**

Add an effect after the `done` derivation (after line 61, `const done = ...`):
```ts
  // Record the session once, when the workout is finished (not on exit/skip-out).
  useEffect(() => {
    if (done && !recordedRef.current && snapshotRef.current) {
      recordedRef.current = true;
      recordCompletion(snapshotRef.current).catch(() => {});
    }
  }, [done]);
```

- [ ] **Step 4: Add the Exit control**

In the control row (the `View` containing Back/Pause/Skip, ~lines 210–214), add an Exit button. Put it on its own line above the row so it reads as a distinct "leave" action:
```tsx
      <ControlButton label="Exit" onPress={() => router.replace("/workouts")} />
      <View style={{ flexDirection: "row", gap: spacing.md, marginTop: spacing.sm }}>
        <ControlButton label="Back" onPress={goBack} />
        <ControlButton label={paused ? "Resume" : "Pause"} onPress={() => setPaused((p) => !p)} wide />
        <ControlButton label="Skip" onPress={goNext} />
      </View>
```

- [ ] **Step 5: Run the full suite + build**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all green (66 existing + new lib tests).

Run: `npx expo export --platform web`
Expected: bundle exports with no errors.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/player/[id].tsx"
git commit -m "feat: player runs snapshots, records completion, adds Exit

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: History screen + home nav

**Files:**
- Create: `src/app/(app)/history.tsx`
- Modify: `src/app/(app)/index.tsx` (add a NavCard)

**Interfaces:**
- Consumes: `listHistory`, `HistoryEntry` from `../../lib/history`; `setPendingRun` from `../../lib/run-session`; existing `Screen`, `ScreenTitle`, `Card`, `Button` from `../../components/ui`; `useFocusEffect`, `useRouter`.
- Produces: route `/history`; navigation to `/player/repeat` after staging a snapshot.

This task has no new unit test (screen render tests excluded). Verification: full suite green + `expo export` clean + route resolves.

- [ ] **Step 1: Create the History screen**

`src/app/(app)/history.tsx`:
```tsx
import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listHistory, type HistoryEntry } from "../../lib/history";
import { setPendingRun } from "../../lib/run-session";
import { Screen, ScreenTitle, Card } from "../../components/ui";
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
      <ScreenTitle>History</ScreenTitle>

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
```

- [ ] **Step 2: Add the History NavCard to home**

In `src/app/(app)/index.tsx`, after the "Browse exercises" `NavCard`, add:
```tsx
      <NavCard
        title="History"
        subtitle="Your completed workouts"
        onPress={() => router.push("/history")}
      />
```

- [ ] **Step 3: Run the full suite + build**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all green.

Run: `npx expo export --platform web`
Expected: bundle exports with no errors (confirms the `/history` route and imports resolve).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/history.tsx" "src/app/(app)/index.tsx"
git commit -m "feat: History screen with Repeat + home nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Post-implementation (out of the task loop)

- Apply migration `0008` to live Supabase (ref `ppgjvqoutuxwhvhyaqhj`) via Management API `POST /v1/projects/<ref>/database/query` with `{"query": "alter table workout_history drop column workout_id;"}` — needs `SUPABASE_ACCESS_TOKEN`. Deferred until the token is available; push to `main` still auto-deploys the app (Vercel), and the app works whether or not the column is dropped since it never reads `workout_id`.
- Update the `padel-hiit-app` memory: History done; note 0008's live-apply status.

## Self-review notes

- **Spec coverage:** data model + snapshot shape (Task 1, 3); `history.ts` record/list (Task 3); `toSnapshot` (Task 4); `run-session` store (Task 2); Player load/record/Exit (Task 5); History screen + Repeat + home nav (Task 6); error swallowing on record/list (Tasks 5, 6); tests for pure logic + migration (Tasks 1–4). All spec sections mapped.
- **Type consistency:** `RunSnapshot` defined in Task 3, consumed by Tasks 2/4/5; `HistoryEntry` in Task 3 consumed by Task 6; `recordCompletion`/`listHistory`/`takePendingRun`/`setPendingRun`/`toSnapshot` names identical across producer and consumer tasks.
- **Note on Task 2/3 order:** `run-session.ts` imports the `RunSnapshot` *type* from `history.ts`. Type-only import — no runtime cycle. Build `history.ts` (Task 3) before or alongside Task 2 if compiling incrementally.
