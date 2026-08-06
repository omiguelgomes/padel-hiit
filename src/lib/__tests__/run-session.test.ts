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
