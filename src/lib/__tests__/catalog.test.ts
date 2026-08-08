jest.mock("../supabase", () => {
  const rows = [
    {
      id: "1",
      name: "Push Up",
      type: "standard",
      source: "exercisedb",
      media_url: "https://cdn.example.com/pushup.gif",
      gif_url: "https://cdn.example.com/pushup-720p.gif",
      config: { body_parts: ["chest"] },
    },
    {
      id: "2",
      name: "Air Squat",
      type: "standard",
      source: "exercisedb",
      media_url: "https://cdn.example.com/squat.png",
      config: {},
    },
  ];
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.order = jest.fn(() => builder);
  builder.ilike = jest.fn(() => builder);
  builder.then = (resolve: any) => resolve({ data: rows, error: null });
  return { supabase: { from: jest.fn(() => builder), __builder: builder } };
});

import { listExercises, readOverview, readInstructions, readStringList, stripStepPrefix } from "../catalog";
import { supabase } from "../supabase";

beforeEach(() => {
  (supabase as any).__builder.ilike.mockClear();
});

test("normalizes exercises rows into CatalogExercise shape", async () => {
  const items = await listExercises();
  expect(items).toEqual([
    {
      id: "1",
      name: "Push Up",
      type: "standard",
      source: "exercisedb",
      mediaUrl: "https://cdn.example.com/pushup.gif",
      gifUrl: "https://cdn.example.com/pushup-720p.gif",
      config: { body_parts: ["chest"] },
    },
    {
      id: "2",
      name: "Air Squat",
      type: "standard",
      source: "exercisedb",
      mediaUrl: "https://cdn.example.com/squat.png",
      gifUrl: null,
      config: {},
    },
  ]);
  expect((supabase as any).from).toHaveBeenCalledWith("exercises");
});

test("applies a case-insensitive name filter when search is given", async () => {
  await listExercises({ search: "push" });
  expect((supabase as any).__builder.ilike).toHaveBeenCalledWith("name", "%push%");
});

test("does not filter when no search is given", async () => {
  await listExercises();
  expect((supabase as any).__builder.ilike).not.toHaveBeenCalled();
});

test("stripStepPrefix removes the upstream Step:N marker", () => {
  expect(stripStepPrefix("Step:1 Stand up straight.")).toBe("Stand up straight.");
  expect(stripStepPrefix("Step:12 Repeat as needed.")).toBe("Repeat as needed.");
});

test("stripStepPrefix leaves unprefixed text untouched", () => {
  expect(stripStepPrefix("Stand up straight.")).toBe("Stand up straight.");
  expect(stripStepPrefix("")).toBe("");
});

test("readOverview returns the overview, or empty when absent or wrong-typed", () => {
  expect(readOverview({ overview: "A biceps exercise." })).toBe("A biceps exercise.");
  expect(readOverview({})).toBe("");
  expect(readOverview({ overview: 42 })).toBe("");
});

test("readInstructions returns the list, or empty when absent or wrong-typed", () => {
  expect(readInstructions({ instructions: ["Step:1 Go.", "Step:2 Stop."] })).toEqual([
    "Step:1 Go.",
    "Step:2 Stop.",
  ]);
  expect(readInstructions({})).toEqual([]);
  expect(readInstructions({ instructions: "nope" })).toEqual([]);
});

test("readInstructions drops non-string entries", () => {
  expect(readInstructions({ instructions: ["Step:1 Go.", 5, null] })).toEqual(["Step:1 Go."]);
});

test("readStringList reads any string-array facet", () => {
  const config = { target_muscles: ["biceps"], equipments: ["barbell"] };
  expect(readStringList(config, "target_muscles")).toEqual(["biceps"]);
  expect(readStringList(config, "equipments")).toEqual(["barbell"]);
  expect(readStringList(config, "body_parts")).toEqual([]);
  expect(readStringList({ body_parts: {} }, "body_parts")).toEqual([]);
});
