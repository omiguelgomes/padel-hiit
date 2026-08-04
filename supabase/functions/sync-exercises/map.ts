export type ApiExercise = {
  exerciseId: string;
  name: string;
  imageUrl: string;
  bodyParts: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  equipments: string[];
  exerciseTypes: string[];
  difficulty: string;
};

export type ExerciseRow = {
  name: string;
  type: "standard";
  source: "exercisedb";
  media_url: string; // upstream hotlink — NEVER a re-hosted copy
  external_id: string;
  owner_id: null;
  config: {
    body_parts: string[];
    target_muscles: string[];
    secondary_muscles: string[];
    equipments: string[];
    difficulty: string;
  };
};

export function mapExerciseToRow(e: ApiExercise): ExerciseRow {
  return {
    name: e.name,
    type: "standard",
    source: "exercisedb",
    media_url: e.imageUrl, // hotlink, unchanged
    external_id: e.exerciseId,
    owner_id: null,
    config: {
      body_parts: e.bodyParts ?? [],
      target_muscles: e.targetMuscles ?? [],
      secondary_muscles: e.secondaryMuscles ?? [],
      equipments: e.equipments ?? [],
      difficulty: e.difficulty ?? "",
    },
  };
}
