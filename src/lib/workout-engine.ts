// src/lib/workout-engine.ts
export type EngineExercise = {
  id: string;
  name: string;
  type: "standard" | "reaction";
  mediaUrl: string | null;
  gifUrl: string | null;
  config: Record<string, unknown>;
};

export type WorkoutSettings = {
  workSecs: number;
  restSecs: number;
  sets: number;
  reactionMinSecs?: number | null;
  reactionMaxSecs?: number | null;
};

export type WorkoutStep =
  | {
      kind: "work";
      exercise: EngineExercise;
      durationSecs: number;
      set: number;
      totalSets: number;
      reaction: { minSecs: number; maxSecs: number } | null;
    }
  | { kind: "rest"; durationSecs: number };

// Flatten a workout circuit into an ordered list of timed steps.
// The exercise list is run once per set. Rest is uniform between exercises:
// it follows every work interval except the very last of the whole workout,
// and is omitted entirely when restSecs <= 0.
export function flattenWorkout(
  exercises: EngineExercise[],
  settings: WorkoutSettings,
): WorkoutStep[] {
  const reaction =
    settings.reactionMinSecs != null && settings.reactionMaxSecs != null
      ? { minSecs: settings.reactionMinSecs, maxSecs: settings.reactionMaxSecs }
      : null;

  const works: WorkoutStep[] = [];
  for (let set = 1; set <= settings.sets; set++) {
    for (const exercise of exercises) {
      works.push({
        kind: "work",
        exercise,
        durationSecs: settings.workSecs,
        set,
        totalSets: settings.sets,
        reaction: exercise.type === "reaction" ? reaction : null,
      });
    }
  }

  const steps: WorkoutStep[] = [];
  works.forEach((work, i) => {
    steps.push(work);
    const isLast = i === works.length - 1;
    if (!isLast && settings.restSecs > 0) {
      steps.push({ kind: "rest", durationSecs: settings.restSecs });
    }
  });

  return steps;
}

export function totalDurationSecs(steps: WorkoutStep[]): number {
  return steps.reduce((sum, s) => sum + s.durationSecs, 0);
}
