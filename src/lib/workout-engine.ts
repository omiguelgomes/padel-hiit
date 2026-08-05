// src/lib/workout-engine.ts
export type EngineExercise = {
  id: string;
  name: string;
  type: "standard" | "reaction";
  mediaUrl: string | null;
  config: Record<string, unknown>;
};

export type BlockDef = {
  exercise: EngineExercise;
  workSecs: number;
  restSecs: number;
  rounds: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
};

export type WorkoutStep =
  | {
      kind: "work";
      exercise: EngineExercise;
      durationSecs: number;
      round: number;
      totalRounds: number;
      set: number;
      totalSets: number;
      reaction: { minSecs: number; maxSecs: number } | null;
    }
  | { kind: "rest"; durationSecs: number };

// Flatten a workout into an ordered list of timed steps.
// Rest is intra-block: it follows every work interval except the last of the
// block, and is omitted entirely when restSecs <= 0. No rest bridges blocks.
export function flattenWorkout(blocks: BlockDef[]): WorkoutStep[] {
  const steps: WorkoutStep[] = [];

  for (const block of blocks) {
    const works: WorkoutStep[] = [];
    for (let set = 1; set <= block.sets; set++) {
      for (let round = 1; round <= block.rounds; round++) {
        works.push({
          kind: "work",
          exercise: block.exercise,
          durationSecs: block.workSecs,
          round,
          totalRounds: block.rounds,
          set,
          totalSets: block.sets,
          reaction:
            block.exercise.type === "reaction" &&
            block.reactionMinSecs != null &&
            block.reactionMaxSecs != null
              ? { minSecs: block.reactionMinSecs, maxSecs: block.reactionMaxSecs }
              : null,
        });
      }
    }

    works.forEach((work, i) => {
      steps.push(work);
      const isLastOfBlock = i === works.length - 1;
      if (!isLastOfBlock && block.restSecs > 0) {
        steps.push({ kind: "rest", durationSecs: block.restSecs });
      }
    });
  }

  return steps;
}

export function totalDurationSecs(steps: WorkoutStep[]): number {
  return steps.reduce((sum, s) => sum + s.durationSecs, 0);
}
