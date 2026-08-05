// src/lib/workouts.ts
import { supabase } from "./supabase";

export type WorkoutSummary = {
  id: string;
  name: string;
  createdAt: string;
};

export type NewBlock = {
  exerciseId: string;
  workSecs: number;
  restSecs: number;
  rounds: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
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
  blocks: NewBlock[];
}): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  const ownerId = userData.user?.id;
  if (!ownerId) throw new Error("Not signed in");

  const { data: workout, error: wErr } = await supabase
    .from("workouts")
    .insert({ name: input.name, owner_id: ownerId })
    .select("id")
    .single();
  if (wErr) throw wErr;

  const rows = input.blocks.map((b, i) => ({
    workout_id: workout.id,
    order: i,
    exercise_id: b.exerciseId,
    work_secs: b.workSecs,
    rest_secs: b.restSecs,
    rounds: b.rounds,
    sets: b.sets,
    reaction_min_secs: b.reactionMinSecs ?? null,
    reaction_max_secs: b.reactionMaxSecs ?? null,
  }));

  if (rows.length > 0) {
    const { error: bErr } = await supabase.from("workout_blocks").insert(rows);
    if (bErr) throw bErr;
  }

  return workout.id;
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}
