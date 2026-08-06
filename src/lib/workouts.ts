// src/lib/workouts.ts
import { supabase } from "./supabase";
import type { WorkoutSettings, EngineExercise } from "./workout-engine";
import type { RunSnapshot } from "./history";

export type WorkoutSummary = {
  id: string;
  name: string;
  createdAt: string;
};

export async function listWorkouts(): Promise<WorkoutSummary[]> {
  const { data, error } = await supabase
    .from("workouts")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
  }));
}

export async function createWorkout(input: {
  name: string;
  workSecs: number;
  restSecs: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
  exerciseIds: string[];
}): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Not signed in");

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({
      name: input.name,
      owner_id: ownerId,
      work_secs: input.workSecs,
      rest_secs: input.restSecs,
      sets: input.sets,
      reaction_min_secs: input.reactionMinSecs ?? null,
      reaction_max_secs: input.reactionMaxSecs ?? null,
    })
    .select("id")
    .single();
  if (wErr) throw wErr;

  const rows = input.exerciseIds.map((exerciseId, i) => ({
    workout_id: workout.id,
    order: i,
    exercise_id: exerciseId,
  }));

  if (rows.length > 0) {
    const { error: bErr } = await supabase.from("workout_blocks").insert(rows);
    if (bErr) throw bErr;
  }

  return workout.id;
}

export type WorkoutDetail = {
  id: string;
  name: string;
  settings: WorkoutSettings;
  exercises: EngineExercise[];
};

export async function getWorkout(id: string): Promise<WorkoutDetail> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, name, work_secs, rest_secs, sets, reaction_min_secs, reaction_max_secs, workout_blocks(order, exercises(id, name, type, media_url, config))",
    )
    .eq("id", id)
    .single();
  if (error) throw error;

  const exercises: EngineExercise[] = (data.workout_blocks ?? [])
    .slice()
    .sort((a: any, b: any) => a.order - b.order)
    .map((b: any) => ({
      id: b.exercises.id,
      name: b.exercises.name,
      type: b.exercises.type,
      mediaUrl: b.exercises.media_url ?? null,
      config: b.exercises.config ?? {},
    }));

  return {
    id: data.id,
    name: data.name,
    settings: {
      workSecs: data.work_secs,
      restSecs: data.rest_secs,
      sets: data.sets,
      reactionMinSecs: data.reaction_min_secs,
      reactionMaxSecs: data.reaction_max_secs,
    },
    exercises,
  };
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}

// Convert a loaded workout into a self-contained, immutable run snapshot.
export function toSnapshot(detail: WorkoutDetail): RunSnapshot {
  return {
    version: 1,
    name: detail.name,
    settings: detail.settings,
    exercises: detail.exercises,
  };
}
