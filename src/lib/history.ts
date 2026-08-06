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
