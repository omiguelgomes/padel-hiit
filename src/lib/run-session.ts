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
