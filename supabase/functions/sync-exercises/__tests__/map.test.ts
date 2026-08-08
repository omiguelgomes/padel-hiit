import { mapExerciseToRow, ApiExercise, mapDetailToPatch } from "../map";

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

const detail = {
  success: true,
  data: {
    exerciseId: "edb_0LC083m",
    gifUrls: {
      "360p": "https://assets.exercisedb.dev/media/VFbvEbq.gif",
      "480p": "https://assets.exercisedb.dev/media/QrVSQ01.gif",
      "720p": "https://assets.exercisedb.dev/media/Yt9Fr2L.gif",
      "1080p": "https://assets.exercisedb.dev/media/13u4Vh5.gif",
    },
    overview: "A strength exercise that targets the biceps.",
    instructions: ["Step:1 Stand up straight.", "Step:2 Curl the bar."],
    exerciseTypes: ["strength"],
  },
};

test("extracts the 720p gif, hotlinked verbatim", () => {
  const patch = mapDetailToPatch(detail);
  // Must be the upstream URL byte-for-byte: any rewrite breaks the licensing rule.
  expect(patch.gif_url).toBe("https://assets.exercisedb.dev/media/Yt9Fr2L.gif");
});

test("extracts overview, instructions and exercise types", () => {
  const patch = mapDetailToPatch(detail);
  expect(patch.overview).toBe("A strength exercise that targets the biceps.");
  expect(patch.instructions).toEqual(["Step:1 Stand up straight.", "Step:2 Curl the bar."]);
  expect(patch.exercise_types).toEqual(["strength"]);
});

test("returns null gif_url when the 720p variant is absent", () => {
  const patch = mapDetailToPatch({ data: { gifUrls: { "360p": "https://x/a.gif" } } });
  expect(patch.gif_url).toBeNull();
});

test("returns empty values for a payload with no detail fields", () => {
  expect(mapDetailToPatch({ data: {} })).toEqual({
    gif_url: null,
    overview: "",
    instructions: [],
    exercise_types: [],
  });
});

test("tolerates malformed input without throwing", () => {
  for (const bad of [null, undefined, "nope", 42, {}, { data: null }]) {
    expect(() => mapDetailToPatch(bad)).not.toThrow();
    expect(mapDetailToPatch(bad).gif_url).toBeNull();
  }
});

test("ignores wrongly-typed fields", () => {
  const patch = mapDetailToPatch({
    data: { gifUrls: { "720p": 5 }, overview: 12, instructions: "not-a-list", exerciseTypes: {} },
  });
  expect(patch).toEqual({ gif_url: null, overview: "", instructions: [], exercise_types: [] });
});
