// src/lib/__tests__/workouts.test.ts
// A chainable mock builder. Each method returns the builder; terminal calls
// resolve via `then` or return canned values. `capture` records insert payloads.
const state: any = { inserted: [], listRows: [], deletedEqCol: null, deletedEq: null };

jest.mock("../supabase", () => {
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.order = jest.fn(() => builder);
  builder.single = jest.fn(() =>
    Promise.resolve({ data: { id: "w1" }, error: null }),
  );
  builder.eq = jest.fn((col: string, val: string) => {
    state.deletedEqCol = col;
    state.deletedEq = val;
    return builder; // chainable: supports .eq(...).single() and await .delete().eq(...)
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

import { listWorkouts, createWorkout, deleteWorkout, getWorkout } from "../workouts";
import { supabase } from "../supabase";

beforeEach(() => {
  state.inserted = [];
  state.listRows = [];
  state.deletedEqCol = null;
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

test("createWorkout throws when not signed in", async () => {
  (supabase.auth.getUser as jest.Mock).mockResolvedValueOnce({
    data: { user: null },
    error: null,
  });
  await expect(createWorkout({ name: "x", workSecs: 30, restSecs: 10, sets: 1, exerciseIds: [] })).rejects.toThrow(
    "Not signed in",
  );
});

test("deleteWorkout filters by id", async () => {
  await deleteWorkout("w1");
  expect((supabase as any).__builder.delete).toHaveBeenCalled();
  expect(state.deletedEqCol).toBe("id");
  expect(state.deletedEq).toBe("w1");
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
