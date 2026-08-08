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

import { listExercises } from "../catalog";
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
