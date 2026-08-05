# Player + Reaction Driver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Player screen that runs a saved workout through timed steps with a countdown, animations, beep + TTS audio cues, pause/skip/back controls, and a reaction driver that randomly calls out moves during reaction exercises.

**Architecture:** The pure `workout-engine` (already built & merged) flattens a workout into `WorkoutStep[]`. This plan adds: a `getWorkout(id)` loader that maps DB rows into the engine's `BlockDef[]`; pure `reaction` helpers (pick a move, compute a random delay) with injectable randomness; a thin `audio` module wrapping `expo-speech`; and the `Player` screen that consumes all of these and drives a 1-second countdown, transitions between steps, plays a beep in the final 3 seconds, speaks step transitions, and — for reaction work steps — runs a sub-timer that speaks random call-outs. History recording is deferred to a later plan (spec §6).

**Tech Stack:** Expo SDK 57 (React Native + RN Web, expo-router), TypeScript, `expo-speech` (TTS), `expo-audio` (beep playback), `expo-image` (hotlinked animations), Supabase (read workout+blocks+exercises), Jest (`jest-expo` preset).

## Global Constraints

- **Read the exact SDK 57 docs before writing Expo code:** https://docs.expo.dev/versions/v57.0.0/ (project AGENTS.md mandate).
- **Engine stays pure and untouched.** `src/lib/workout-engine.ts` already exists and is merged — do NOT modify it. The Player consumes `flattenWorkout(blocks)` and `WorkoutStep`.
- **`getWorkout` never trusts a client-supplied owner.** RLS on `workouts`/`workout_blocks` already scopes reads to `auth.uid()`; the loader passes only the workout `id`.
- **Media is never re-hosted.** Animations render from `media_url` hotlinks via `expo-image`, exactly as the Library screen does.
- **Reaction pool is per-exercise, timing is per-block** (spec §6): the pool lives in `exercises.config.pool` (`[{call, media_url, audio_url}]`); the random interval comes from the block's `reaction_min_secs`/`reaction_max_secs`, surfaced by the engine as `step.reaction = {minSecs, maxSecs}`.
- **Audio is pluggable** (spec §8): a pool move with `audio_url === null` uses device TTS; recorded-file playback is deferred (TTS covers v1). Beeps are a bundled, self-generated CC0 asset.
- **No new migration** — `workouts`, `workout_blocks`, `exercises` all exist from `0001_init.sql`.
- **History is deferred.** Completing a workout returns to the workouts list; do NOT write `workout_history`.
- **Match existing patterns:** functional components with hooks, inline styles, `expo-router` `<Link>`/`useRouter`, mocks in test files follow `src/app/__tests__/*.test.tsx` conventions.
- **Jest is configured inline in `package.json`** (no `jest.config.js`). Run tests with `npx jest`. In a `jest.mock()` factory, reference React via `require("react")` (factories cannot close over out-of-scope vars). Any bare string must be inside `<Text>`.

---

### Task 1: `getWorkout` loader

**Files:**
- Modify: `src/lib/workouts.ts`
- Test: `src/lib/__tests__/workouts.test.ts` (existing — add cases)

**Interfaces:**
- Consumes: `BlockDef` from `src/lib/workout-engine.ts`:
  ```ts
  type BlockDef = {
    exercise: { id: string; name: string; type: "standard" | "reaction"; mediaUrl: string | null; config: Record<string, unknown> };
    workSecs: number; restSecs: number; rounds: number; sets: number;
    reactionMinSecs?: number | null; reactionMaxSecs?: number | null;
  };
  ```
- Produces: `getWorkout(id: string): Promise<WorkoutDetail>` where
  ```ts
  type WorkoutDetail = { id: string; name: string; blocks: BlockDef[] };
  ```
  Blocks are returned sorted by their `order` column ascending. Task 4 (Player) consumes this.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/__tests__/workouts.test.ts`. The existing mock builder is chainable and thenable; extend it so a `.eq(...)` used for a *read* (after `.select().order()`... no — `getWorkout` uses `.select(...).eq("id", id).single()`) resolves via `.single()`. The existing `builder.single` already resolves `{ data: { id: "w1" }, error: null }`; override it per-test with `mockResolvedValueOnce` to return a nested row.

```ts
test("getWorkout maps nested blocks into engine BlockDefs sorted by order", async () => {
  (supabase as any).__builder.single.mockResolvedValueOnce({
    data: {
      id: "w1",
      name: "Padel HIIT",
      workout_blocks: [
        {
          order: 1,
          work_secs: 40, rest_secs: 15, rounds: 2, sets: 1,
          reaction_min_secs: 2, reaction_max_secs: 5,
          exercises: { id: "e2", name: "Reaction Swing", type: "reaction", media_url: "https://x/bh.mp4", config: { pool: [] } },
        },
        {
          order: 0,
          work_secs: 30, rest_secs: 10, rounds: 3, sets: 1,
          reaction_min_secs: null, reaction_max_secs: null,
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
  // sorted by order: standard first, reaction second
  expect(out.blocks.map((b) => b.exercise.id)).toEqual(["e1", "e2"]);
  expect(out.blocks[0]).toEqual({
    exercise: { id: "e1", name: "Jumping Jacks", type: "standard", mediaUrl: null, config: {} },
    workSecs: 30, restSecs: 10, rounds: 3, sets: 1,
    reactionMinSecs: null, reactionMaxSecs: null,
  });
  expect(out.blocks[1].reactionMinSecs).toBe(2);
  expect(out.blocks[1].exercise.mediaUrl).toBe("https://x/bh.mp4");
});
```

You must also extend the mock so `.eq(...)` is chainable for reads (it currently returns a resolved Promise, which breaks `.eq().single()`). In the `jest.mock("../supabase", ...)` factory, change `builder.eq` to return the builder while still recording its args, and make the delete path resolve via the thenable instead:

```ts
builder.eq = jest.fn((col: string, val: string) => {
  state.deletedEqCol = col;
  state.deletedEq = val;
  return builder; // chainable: supports .eq(...).single() and await .delete().eq(...)
});
```

Because `deleteWorkout` does `await supabase.from(...).delete().eq("id", id)`, and `.eq` now returns the builder, the builder's existing `then` resolves it to `{ data: state.listRows, error: null }`. Update the delete assertion if needed — it still records `deletedEqCol`/`deletedEq`, so the existing `deleteWorkout` test keeps passing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest workouts.test -t "getWorkout maps nested"`
Expected: FAIL — `getWorkout` is not exported.

- [ ] **Step 3: Implement `getWorkout`**

Add to `src/lib/workouts.ts`. Add the import at the top and the type + function:

```ts
import type { BlockDef } from "./workout-engine";

export type WorkoutDetail = {
  id: string;
  name: string;
  blocks: BlockDef[];
};

export async function getWorkout(id: string): Promise<WorkoutDetail> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, name, workout_blocks(order, work_secs, rest_secs, rounds, sets, reaction_min_secs, reaction_max_secs, exercises(id, name, type, media_url, config))",
    )
    .eq("id", id)
    .single();
  if (error) throw error;

  const blocks: BlockDef[] = (data.workout_blocks ?? [])
    .slice()
    .sort((a: any, b: any) => a.order - b.order)
    .map((b: any) => ({
      exercise: {
        id: b.exercises.id,
        name: b.exercises.name,
        type: b.exercises.type,
        mediaUrl: b.exercises.media_url ?? null,
        config: b.exercises.config ?? {},
      },
      workSecs: b.work_secs,
      restSecs: b.rest_secs,
      rounds: b.rounds,
      sets: b.sets,
      reactionMinSecs: b.reaction_min_secs,
      reactionMaxSecs: b.reaction_max_secs,
    }));

  return { id: data.id, name: data.name, blocks };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest workouts.test`
Expected: PASS (all existing cases + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workouts.ts src/lib/__tests__/workouts.test.ts
git commit -m "feat: getWorkout loads a workout + blocks as engine BlockDefs"
```

---

### Task 2: Pure reaction helpers

**Files:**
- Create: `src/lib/reaction.ts`
- Test: `src/lib/__tests__/reaction.test.ts`

**Interfaces:**
- Produces (consumed by Task 4):
  ```ts
  type ReactionMove = { call: string; mediaUrl: string | null; audioUrl: string | null };
  function readPool(config: Record<string, unknown>): ReactionMove[];
  function pickMove(pool: ReactionMove[], rnd?: () => number): ReactionMove | null;
  function nextDelayMs(minSecs: number, maxSecs: number, rnd?: () => number): number;
  ```
  `rnd` defaults to `Math.random` and is injected in tests. `readPool` reads `config.pool` (spec shape `[{call, media_url, audio_url}]`) and tolerates missing/malformed data.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/__tests__/reaction.test.ts`:

```ts
import { readPool, pickMove, nextDelayMs } from "../reaction";

describe("readPool", () => {
  test("maps spec-shaped pool entries", () => {
    const pool = readPool({
      pool: [
        { call: "Forehand", media_url: "https://x/fh.mp4", audio_url: null },
        { call: "Backhand", media_url: null, audio_url: "https://x/bh.mp3" },
      ],
    });
    expect(pool).toEqual([
      { call: "Forehand", mediaUrl: "https://x/fh.mp4", audioUrl: null },
      { call: "Backhand", mediaUrl: null, audioUrl: "https://x/bh.mp3" },
    ]);
  });

  test("returns [] for missing or malformed pool", () => {
    expect(readPool({})).toEqual([]);
    expect(readPool({ pool: "nope" as any })).toEqual([]);
    expect(readPool({ pool: [{ nocall: true } as any] })).toEqual([]);
  });
});

describe("pickMove", () => {
  const pool = [
    { call: "A", mediaUrl: null, audioUrl: null },
    { call: "B", mediaUrl: null, audioUrl: null },
  ];
  test("picks by injected randomness", () => {
    expect(pickMove(pool, () => 0)?.call).toBe("A");
    expect(pickMove(pool, () => 0.99)?.call).toBe("B");
  });
  test("returns null for an empty pool", () => {
    expect(pickMove([], () => 0)).toBeNull();
  });
});

describe("nextDelayMs", () => {
  test("interpolates between min and max in milliseconds", () => {
    expect(nextDelayMs(2, 5, () => 0)).toBe(2000);
    expect(nextDelayMs(2, 5, () => 0.5)).toBe(3500);
  });
  test("tolerates reversed bounds and clamps negatives", () => {
    expect(nextDelayMs(5, 2, () => 0)).toBe(2000);
    expect(nextDelayMs(-3, -1, () => 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest reaction.test`
Expected: FAIL — module `../reaction` not found.

- [ ] **Step 3: Implement `src/lib/reaction.ts`**

```ts
// src/lib/reaction.ts
// Pure helpers for the reaction driver. Randomness is injected so the Player's
// call-out behaviour is deterministic under test.

export type ReactionMove = {
  call: string;
  mediaUrl: string | null;
  audioUrl: string | null;
};

// Read the per-exercise call-out pool from an exercise's config.
// Spec shape: config.pool = [{ call, media_url, audio_url }]
export function readPool(config: Record<string, unknown>): ReactionMove[] {
  const raw = (config as any)?.pool;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.call === "string")
    .map((m) => ({
      call: m.call,
      mediaUrl: m.media_url ?? null,
      audioUrl: m.audio_url ?? null,
    }));
}

export function pickMove(
  pool: ReactionMove[],
  rnd: () => number = Math.random,
): ReactionMove | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

// A random delay in ms within [min, max] seconds. Bounds are normalised
// (reversed order tolerated) and clamped at zero.
export function nextDelayMs(
  minSecs: number,
  maxSecs: number,
  rnd: () => number = Math.random,
): number {
  const lo = Math.max(0, Math.min(minSecs, maxSecs));
  const hi = Math.max(0, Math.max(minSecs, maxSecs));
  return Math.round((lo + rnd() * (hi - lo)) * 1000);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest reaction.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reaction.ts src/lib/__tests__/reaction.test.ts
git commit -m "feat: pure reaction-driver helpers (pool, pick, delay)"
```

---

### Task 3: Audio module, beep asset, and dependencies

**Files:**
- Create: `src/lib/audio.ts`
- Create: `scripts/gen-beep.mjs` (committed generator for a self-made CC0 beep)
- Create: `assets/beep.wav` (generated output, committed)
- Test: `src/lib/__tests__/audio.test.ts`
- Modify: `package.json` / lockfile (via `expo install`)

**Interfaces:**
- Produces (consumed by Task 4):
  ```ts
  function speak(text: string): void;   // stops any current speech, then speaks
  function stopSpeaking(): void;
  ```
- The beep asset is `require`d directly by the Player via `expo-audio`'s `useAudioPlayer`; the audio module itself does NOT wrap beep playback (the hook must live in the component).

- [ ] **Step 1: Install the native modules**

Run: `npx expo install expo-speech expo-audio`
Expected: `package.json` gains `expo-speech` and `expo-audio` at SDK-57-compatible versions.

- [ ] **Step 2: Write the failing test**

Create `src/lib/__tests__/audio.test.ts`:

```ts
const mockStop = jest.fn();
const mockSpeak = jest.fn();
jest.mock("expo-speech", () => ({
  stop: (...a: any[]) => mockStop(...a),
  speak: (...a: any[]) => mockSpeak(...a),
}));

import { speak, stopSpeaking } from "../audio";

beforeEach(() => jest.clearAllMocks());

test("speak interrupts current speech then speaks the text", () => {
  speak("Rest");
  expect(mockStop).toHaveBeenCalledTimes(1);
  expect(mockSpeak).toHaveBeenCalledWith("Rest");
  // stop is called before speak
  expect(mockStop.mock.invocationCallOrder[0]).toBeLessThan(
    mockSpeak.mock.invocationCallOrder[0],
  );
});

test("stopSpeaking stops speech", () => {
  stopSpeaking();
  expect(mockStop).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest audio.test`
Expected: FAIL — module `../audio` not found.

- [ ] **Step 4: Implement `src/lib/audio.ts`**

```ts
// src/lib/audio.ts
// Thin TTS wrapper. A single utterance at a time: interrupt before speaking so
// step transitions and reaction call-outs never queue up behind each other.
import * as Speech from "expo-speech";

export function speak(text: string): void {
  Speech.stop();
  Speech.speak(text);
}

export function stopSpeaking(): void {
  Speech.stop();
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest audio.test`
Expected: PASS.

- [ ] **Step 6: Write and run the beep generator**

Create `scripts/gen-beep.mjs` — writes a short 16-bit PCM mono WAV (880 Hz sine, 120 ms, with a tiny linear fade to avoid clicks). This is self-made content (CC0), so there is no third-party audio licence to clear.

```js
// scripts/gen-beep.mjs
// Generates assets/beep.wav — a self-made 880Hz sine beep (CC0). Run: node scripts/gen-beep.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const sampleRate = 44100;
const seconds = 0.12;
const freq = 880;
const n = Math.floor(sampleRate * seconds);
const data = Buffer.alloc(n * 2);
const fade = Math.floor(n * 0.1); // 10% fade in/out
for (let i = 0; i < n; i++) {
  let amp = 0.6;
  if (i < fade) amp *= i / fade;
  else if (i > n - fade) amp *= (n - i) / fade;
  const s = Math.sin((2 * Math.PI * freq * i) / sampleRate) * amp;
  data.writeInt16LE(Math.max(-1, Math.min(1, s)) * 32767, i * 2);
}

const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + data.length, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * 2, 28); // byte rate
header.writeUInt16LE(2, 32); // block align
header.writeUInt16LE(16, 34); // bits per sample
header.write("data", 36);
header.writeUInt32LE(data.length, 40);

mkdirSync("assets", { recursive: true });
writeFileSync("assets/beep.wav", Buffer.concat([header, data]));
console.log("Wrote assets/beep.wav", 44 + data.length, "bytes");
```

Run: `node scripts/gen-beep.mjs`
Expected: `assets/beep.wav` created (~10 KB).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/audio.ts src/lib/__tests__/audio.test.ts scripts/gen-beep.mjs assets/beep.wav
git commit -m "feat: TTS audio wrapper + self-made CC0 beep asset; add expo-speech/expo-audio"
```

---

### Task 4: Player screen with reaction driver

**Files:**
- Create: `src/app/(app)/player/[id].tsx`
- Modify: `src/app/(app)/workouts.tsx` (add a Play link per workout)
- Test: `src/app/__tests__/player.test.tsx`

**Interfaces:**
- Consumes: `getWorkout` (Task 1), `flattenWorkout` + `WorkoutStep` (engine, existing), `speak`/`stopSpeaking` (Task 3), `readPool`/`pickMove`/`nextDelayMs`/`ReactionMove` (Task 2), the beep asset (Task 3), `expo-audio` `useAudioPlayer`/`setAudioModeAsync`, `expo-image` `Image`, `expo-router` `useLocalSearchParams`/`useRouter`.
- Route: `/player/<workoutId>` (expo-router dynamic segment `[id]`).

- [ ] **Step 1: Write the failing test**

Create `src/app/__tests__/player.test.tsx`. Mock every native/IO edge. The countdown uses `setInterval`; keep the test to a load-and-render smoke check plus a Skip assertion (deep fake-timer countdown tests are intentionally out of scope — the pure logic is tested in Tasks 1–2).

```tsx
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "w1" }),
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
}));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
}));
const mockSpeak = jest.fn();
jest.mock("../../lib/audio", () => ({
  speak: (...a: any[]) => mockSpeak(...a),
  stopSpeaking: jest.fn(),
}));

const mockGetWorkout = jest.fn().mockResolvedValue({
  id: "w1",
  name: "Padel HIIT",
  blocks: [
    {
      exercise: { id: "e1", name: "Jumping Jacks", type: "standard", mediaUrl: null, config: {} },
      workSecs: 30, restSecs: 10, rounds: 2, sets: 1,
      reactionMinSecs: null, reactionMaxSecs: null,
    },
  ],
});
jest.mock("../../lib/workouts", () => ({
  getWorkout: (...a: any[]) => mockGetWorkout(...a),
}));

import Player from "../(app)/player/[id]";

beforeEach(() => jest.clearAllMocks());

test("loads the workout and shows the first work step", async () => {
  const { findByText } = await render(<Player />);
  expect(await findByText("Jumping Jacks")).toBeTruthy();
  // announces the first exercise via TTS
  await waitFor(() => expect(mockSpeak).toHaveBeenCalledWith("Jumping Jacks"));
});

test("Skip advances from the first work step to the rest step", async () => {
  const { findByText, getByText } = await render(<Player />);
  await findByText("Jumping Jacks");
  await act(async () => {
    fireEvent.press(getByText("Skip"));
  });
  // 2 rounds with 10s rest between -> after first work comes a rest step
  expect(await findByText("Rest")).toBeTruthy();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest player.test`
Expected: FAIL — `../(app)/player/[id]` not found.

- [ ] **Step 3: Implement the Player screen**

Create `src/app/(app)/player/[id].tsx`:

```tsx
// src/app/(app)/player/[id].tsx
import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAudioPlayer, setAudioModeAsync } from "expo-audio";
import { getWorkout } from "../../../lib/workouts";
import { flattenWorkout, type WorkoutStep } from "../../../lib/workout-engine";
import { speak, stopSpeaking } from "../../../lib/audio";
import { readPool, pickMove, nextDelayMs, type ReactionMove } from "../../../lib/reaction";

const beep = require("../../../../assets/beep.wav");

function announce(step: WorkoutStep | null): void {
  if (!step) {
    speak("Workout complete");
    return;
  }
  if (step.kind === "rest") speak("Rest");
  else speak(step.exercise.name);
}

export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [steps, setSteps] = useState<WorkoutStep[]>([]);
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [paused, setPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [call, setCall] = useState<ReactionMove | null>(null);
  const stepsRef = useRef<WorkoutStep[]>([]);
  const beepPlayer = useAudioPlayer(beep);

  // Load the workout, flatten it, and start the first step.
  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    let active = true;
    getWorkout(id)
      .then((w) => {
        if (!active) return;
        const flat = flattenWorkout(w.blocks);
        stepsRef.current = flat;
        setSteps(flat);
        setRemaining(flat[0]?.durationSecs ?? 0);
        setLoaded(true);
        announce(flat[0] ?? null);
      })
      .catch(() => active && setLoaded(true));
    return () => {
      active = false;
      stopSpeaking();
    };
  }, [id]);

  const step = steps[index] ?? null;
  const done = loaded && steps.length > 0 && index >= steps.length;

  const goTo = (ni: number) => {
    stopSpeaking();
    setCall(null);
    const ns = stepsRef.current[ni] ?? null;
    setIndex(ni);
    setRemaining(ns ? ns.durationSecs : 0);
    announce(ns);
  };
  const goNext = () => goTo(index + 1);
  const goBack = () => goTo(Math.max(0, index - 1));

  // 1-second countdown while a step is active and not paused.
  useEffect(() => {
    if (paused || done || !loaded || !step) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [paused, done, loaded, step]);

  // Beep in the final 3 seconds; advance when the step hits zero.
  useEffect(() => {
    if (!step) return;
    if (remaining > 0 && remaining <= 3) {
      beepPlayer.seekTo(0);
      beepPlayer.play();
    }
    if (remaining === 0 && loaded) goNext();
    // goNext reads `index` from this render's closure; effect re-runs each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  // Reaction driver: on reaction work steps, fire random call-outs.
  useEffect(() => {
    if (paused || !step || step.kind !== "work" || !step.reaction) return;
    const pool = readPool(step.exercise.config);
    if (pool.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        const move = pickMove(pool);
        if (move) {
          setCall(move);
          if (move.audioUrl == null) speak(move.call); // recorded audio deferred
        }
        schedule();
      }, nextDelayMs(step.reaction!.minSecs, step.reaction!.maxSecs));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [paused, step, index]);

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (done || steps.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16 }}>
        <Text style={{ fontSize: 24, fontWeight: "700" }}>
          {steps.length === 0 ? "This workout has no steps." : "Workout complete!"}
        </Text>
        <Pressable
          onPress={() => router.replace("/workouts")}
          style={{ backgroundColor: "#222", padding: 14, borderRadius: 8 }}
        >
          <Text style={{ color: "white" }}>Back to workouts</Text>
        </Pressable>
      </View>
    );
  }

  const isRest = step!.kind === "rest";
  const upNext = steps[index + 1] ?? null;
  const animationUrl = call?.mediaUrl ?? (step!.kind === "work" ? step!.exercise.mediaUrl : null);

  return (
    <View style={{ flex: 1, padding: 24, gap: 20, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: 20, fontWeight: "600", color: isRest ? "#0891b2" : "#111" }}>
        {isRest ? "Rest" : step!.exercise.name}
      </Text>

      {step!.kind === "work" ? (
        <Text style={{ color: "#666" }}>
          Round {step!.round}/{step!.totalRounds}
          {step!.totalSets > 1 ? ` · Set ${step!.set}/${step!.totalSets}` : ""}
        </Text>
      ) : null}

      {animationUrl ? (
        <Image source={{ uri: animationUrl }} style={{ width: 220, height: 220 }} contentFit="contain" />
      ) : null}

      {call ? <Text style={{ fontSize: 32, fontWeight: "800", color: "#dc2626" }}>{call.call}</Text> : null}

      <Text style={{ fontSize: 64, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{remaining}</Text>

      {upNext ? (
        <Text style={{ color: "#888" }}>
          Up next: {upNext.kind === "rest" ? "Rest" : upNext.exercise.name}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 16, marginTop: 8 }}>
        <Pressable onPress={goBack} style={{ padding: 12, borderWidth: 1, borderRadius: 8 }}>
          <Text>Back</Text>
        </Pressable>
        <Pressable
          onPress={() => setPaused((p) => !p)}
          style={{ padding: 12, borderWidth: 1, borderRadius: 8, minWidth: 84, alignItems: "center" }}
        >
          <Text>{paused ? "Resume" : "Pause"}</Text>
        </Pressable>
        <Pressable onPress={goNext} style={{ padding: 12, borderWidth: 1, borderRadius: 8 }}>
          <Text>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 4: Add a Play link to the workouts list**

Modify `src/app/(app)/workouts.tsx`. Import `Link` (already imported). In the row, add a Play link before the Delete button. Replace the row's `renderItem` return with:

```tsx
<View
  style={{
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  }}
>
  <Text style={{ fontSize: 16 }}>{item.name}</Text>
  <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
    <Link href={`/player/${item.id}`}>
      <Text style={{ color: "#2563eb" }}>Play</Text>
    </Link>
    <Pressable onPress={() => remove(item.id)} style={{ padding: 6 }}>
      <Text style={{ color: "#dc2626" }}>Delete</Text>
    </Pressable>
  </View>
</View>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest player.test`
Expected: PASS (both cases).

- [ ] **Step 6: Run the full suite**

Run: `npx jest`
Expected: all suites pass (the new `player.test.tsx` plus all existing).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/player/[id].tsx" "src/app/(app)/workouts.tsx" src/app/__tests__/player.test.tsx
git commit -m "feat: workout Player with countdown, beep+TTS cues, reaction driver, pause/skip/back"
```

---

## Notes for the implementer

- **Do not modify `src/lib/workout-engine.ts`.** It is complete and merged.
- **The engine emits no trailing rest** and no rest between blocks — the Player renders exactly what it gets; do not add rest logic in the Player.
- **`goNext` inside the `[remaining]` effect** reads `index` from the current render's closure — this is intentional and correct because the effect has no stable-deps requirement (it re-subscribes each render). Do not "fix" it by memoizing `goNext`.
- **Web behaviour:** `expo-speech` supports web; `expo-audio` supports web (beep may require a user gesture first in some browsers — acceptable for v1). No platform branching needed.
- **When running the suite from the repo root** during manual verification, exclude any nested worktree copies to avoid Jest Haste duplicate-module collisions: `npx jest --modulePathIgnorePatterns /.claude/`. Inside a dedicated worktree this is not needed.
