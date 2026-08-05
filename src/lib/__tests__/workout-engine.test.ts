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
