import { mapExerciseToRow, ApiExercise } from "../map";

const sample: ApiExercise = {
  exerciseId: "0001",
  name: "3/4 sit-up",
  imageUrl: "https://cdn.example.com/exercises/0001.gif",
  bodyParts: ["waist"],
  targetMuscles: ["abs"],
  secondaryMuscles: ["hip flexors"],
  equipments: ["body weight"],
  exerciseTypes: ["strength"],
  difficulty: "beginner",
};

test("maps an ExerciseDB object to a built-in standard exercise row", () => {
  const row = mapExerciseToRow(sample);
  expect(row.name).toBe("3/4 sit-up");
  expect(row.type).toBe("standard");
  expect(row.source).toBe("exercisedb");
  expect(row.external_id).toBe("0001");
  expect(row.owner_id).toBeNull();
});

test("hotlinks the upstream image verbatim — never re-hosts media", () => {
  const row = mapExerciseToRow(sample);
  // media_url MUST be the upstream URL, byte-for-byte. Any transform here
  // (download, re-upload, path rewrite) would violate the licensing constraint.
  expect(row.media_url).toBe("https://cdn.example.com/exercises/0001.gif");
});

test("caches facet metadata in config", () => {
  const row = mapExerciseToRow(sample);
  expect(row.config).toEqual({
    body_parts: ["waist"],
    target_muscles: ["abs"],
    secondary_muscles: ["hip flexors"],
    equipments: ["body weight"],
    difficulty: "beginner",
  });
});
