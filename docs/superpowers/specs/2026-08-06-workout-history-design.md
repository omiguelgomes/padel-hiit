# Workout History — Design

Date: 2026-08-06

## Goal

Record every completed workout run as an immutable, self-contained session,
list past sessions, and let the user re-run any of them ("Repeat"). Also add an
**Exit** control to the Player so a run can be abandoned mid-way.

## Core principle: history and workouts are separate concepts

A history entry is a complete record of a *session* — the full workout as it was
run — with **no reference to the `workouts` table**. Repeat replays the stored
snapshot; it never looks anything up in `workouts`. History therefore survives
the source workout being edited or deleted, because there is no link to break.

## Data model

`workout_history` already exists (migration `0001`). Migration `0008` removes its
only link to workouts:

```sql
-- 0008_history_decouple.sql
alter table workout_history drop column workout_id;
```

Final shape: `id uuid pk`, `owner_id uuid references profiles(id) on delete
cascade`, `completed_at timestamptz not null default now()`, `settings_snapshot
jsonb not null`. Existing RLS policy ("own history") and API grants (`0003`,
`grant ... to authenticated`) already cover the table — no policy or grant
changes needed.

### Snapshot shape (`settings_snapshot`)

A complete, self-contained run definition — enough to run with zero DB reads:

```json
{
  "version": 1,
  "name": "Tuesday Circuit",
  "settings": {
    "workSecs": 30,
    "restSecs": 10,
    "sets": 3,
    "reactionMinSecs": 2,
    "reactionMaxSecs": 5
  },
  "exercises": [
    {
      "id": "…",
      "name": "Volley",
      "type": "reaction",
      "mediaUrl": "https://…",
      "config": { "pool": [ /* … */ ] }
    }
  ]
}
```

This is exactly `WorkoutDetail` minus its `id`. `version` future-proofs the
format. It flattens through the existing `flattenWorkout(exercises, settings)`
with no database lookups.

## Modules

### `src/lib/history.ts` (new) — the only module touching `workout_history`

- `type RunSnapshot` — the versioned snapshot shape above.
- `type HistoryEntry = { id: string; completedAt: string; snapshot: RunSnapshot }`.
- `recordCompletion(snapshot: RunSnapshot): Promise<void>` — stamps `owner_id`
  from `auth.getUser()` (never client-supplied, matching `createWorkout`),
  inserts one row.
- `listHistory(): Promise<HistoryEntry[]>` — selects own rows ordered
  `completed_at desc`, maps to `HistoryEntry[]`.

### `src/lib/workouts.ts` (one addition)

- `toSnapshot(detail: WorkoutDetail): RunSnapshot` — pure mapper from a loaded
  workout to the snapshot shape (drops `id`, sets `version: 1`). Unit-testable
  without mocks.

### `src/lib/run-session.ts` (new, tiny) — in-memory pending-run store

- Module-level `let pending: RunSnapshot | null`.
- `setPendingRun(s: RunSnapshot): void`.
- `takePendingRun(): RunSnapshot | null` — read-and-clear, so a stale snapshot
  can't leak into a later normal run.

This is how Repeat hands a snapshot to the Player without serializing JSON
through the URL.

No new dependencies.

## Screens & data flow

### Player (`src/app/(app)/player/[id].tsx`) — three changes

1. **Load path.** On mount, call `takePendingRun()` first. If a snapshot is
   pending → flatten it directly (no DB read). Otherwise → `getWorkout(id)` as
   today, and keep the loaded `WorkoutDetail` so it can be snapshotted on
   completion. Both paths converge on the same flattened `steps`. Repeat
   navigates to the sentinel route `/player/repeat` with the snapshot pre-staged.

2. **Record on completion.** On the existing `done` transition (workout
   finished — not exit, not an early quit), call `recordCompletion(snapshot)`
   exactly once, guarded by a `useRef` boolean so effect re-renders can't insert
   duplicates. The recorded snapshot is what was actually run: for a normal run,
   `toSnapshot(loadedWorkout)`; for a repeat, the same pending snapshot. A
   completed repeat therefore creates a **new** history row — it is a real
   session on a new date.

3. **Exit control.** Add **Exit** to the control row → `router.replace(
   "/workouts")`. No history write; quitting early never records.

### History (`src/app/(app)/history.tsx`) (new)

Mirrors the `workouts.tsx` list pattern (`Screen` / `ScreenTitle` / `Card` /
`FlatList`, `useFocusEffect` refresh):

- Each row: workout **name** + formatted **completed date**, and a **Repeat**
  action.
- Repeat → `setPendingRun(entry.snapshot)` then `router.push("/player/repeat")`.
- Empty state: "No completed workouts yet."

### Home (`src/app/(app)/index.tsx`)

Add a third `NavCard`: **"History" / "Your completed workouts"** → `/history`.

### Flow summary

- **Normal run:** home → workouts → Play → finish → `recordCompletion` →
  complete screen.
- **Repeat:** home → history → Repeat → `setPendingRun` + navigate → Player
  flattens the snapshot → finish → `recordCompletion` (new row) → complete
  screen.
- **Exit:** any run → Exit → back to workouts, nothing recorded.

## Error handling

- `recordCompletion` failure never blocks the UI: caller uses
  `recordCompletion(s).catch(() => {})` — the complete screen shows regardless
  (same swallow-and-continue the Player already uses for `getWorkout`).
- `listHistory` failure → empty list (`.catch(() => setItems([]))`, as in
  `workouts.tsx`).
- Repeat with an empty/invalid snapshot → the Player's existing
  `steps.length === 0` guard renders "This workout has no steps." No new
  handling.
- Record-once `useRef` guard prevents duplicate rows on the completion transition.

## Testing

Pure-logic focus, matching how the engine/reaction libs are tested:

- `toSnapshot` — maps `WorkoutDetail` → correct versioned snapshot; drops `id`;
  preserves exercise order, `config`, `mediaUrl`.
- `run-session` — `setPendingRun`/`takePendingRun` round-trips; second
  `takePendingRun` returns `null` (clears).
- `history.ts` (mocked supabase client) — `recordCompletion` inserts a row
  stamped with the authed `owner_id` (never client-supplied); `listHistory`
  maps rows → `HistoryEntry[]` ordered `completed_at desc`.
- Migration static test — `0008` file exists and drops `workout_id` (matches the
  `schema-0006/0007.test.ts` convention).

Heavy Player-screen render tests for the new load/record wiring are intentionally
skipped: the existing suite has documented FlatList/timer flakiness, and the new
logic lives in the pure libs above where it is directly testable.

## Out of scope

- Partial/abandoned-run logging (only full completions are recorded).
- Repeat launching from the completion screen (History list only).
- Editing or deleting history entries.
- Stats/aggregates over history (streaks, totals) — post-v1.

## Live deployment note

Migration `0008` must be applied to the live Supabase DB
(ref `ppgjvqoutuxwhvhyaqhj`) via the Management API
`POST /v1/projects/<ref>/database/query` (direct DB host does not resolve in this
env), which requires `SUPABASE_ACCESS_TOKEN`. The migration file remains the
reproducible source of truth. App code works locally against the migration
regardless.
