// src/lib/workouts.ts
import { supabase } from "./supabase";
import type { BlockDef } from "./workout-engine";

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

export type WorkoutDetail = {
  id: string;
  name: string;
  blocks: BlockDef[];
};

export async function getWorkout(id: string): Promise<WorkoutDetail> {
  const { data, error } = await supabase
    .from("workouts")
    .select(
      "id, name, workout_blocks(order, work_secs, rest_secs, rounds, sets, reaction_min_secs, reaction_max_secs, exercises(id, name, type, media_url, config))",
    )
    .eq("id", id)
    .single();
  if (error) throw error;

  const blocks: BlockDef[] = (data.workout_blocks ?? [])
    .slice()
    .sort((a: any, b: any) => a.order - b.order)
    .map((b: any) => ({
      exercise: {
        id: b.exercises.id,
        name: b.exercises.name,
        type: b.exercises.type,
        mediaUrl: b.exercises.media_url ?? null,
        config: b.exercises.config ?? {},
      },
      workSecs: b.work_secs,
      restSecs: b.rest_secs,
      rounds: b.rounds,
      sets: b.sets,
      reactionMinSecs: b.reaction_min_secs,
      reactionMaxSecs: b.reaction_max_secs,
    }));

  return { id: data.id, name: data.name, blocks };
}

export async function deleteWorkout(id: string): Promise<void> {
  const { error } = await supabase.from("workouts").delete().eq("id", id);
  if (error) throw error;
}
