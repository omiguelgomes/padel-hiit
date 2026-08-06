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
