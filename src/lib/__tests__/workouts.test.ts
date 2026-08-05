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
  expect(state.deletedEqCol).toBe("id");
  expect(state.deletedEq).toBe("w1");
});
