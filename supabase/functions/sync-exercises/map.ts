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

// The three config keys the detail endpoint contributes, plus the animated URL.
// media_url (static PNG) comes from the list endpoint via mapExerciseToRow.
export type DetailPatch = {
  gif_url: string | null;
  overview: string;
  instructions: string[];
  exercise_types: string[];
};

const GIF_RESOLUTION = "720p";

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// Total by design: the detail endpoint is fetched per-exercise during sync, and
// one malformed or 404 response must not abort the whole catalog.
export function mapDetailToPatch(detail: unknown): DetailPatch {
  const data = asRecord(asRecord(detail).data);
  const gif = asString(asRecord(data.gifUrls)[GIF_RESOLUTION]);
  return {
    gif_url: gif === "" ? null : gif, // hotlink, unchanged
    overview: asString(data.overview),
    instructions: asStringList(data.instructions),
    exercise_types: asStringList(data.exerciseTypes),
  };
}
