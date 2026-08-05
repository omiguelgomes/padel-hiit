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
