import { readFileSync } from "fs";
import { join } from "path";

const raw = readFileSync(join(__dirname, "..", "0009_exercise_gif_url.sql"), "utf8");
const sql = raw.toLowerCase();

test("adds a nullable gif_url column to exercises", () => {
  expect(sql).toContain("alter table exercises");
  expect(sql).toContain("add column gif_url text");
  expect(sql).not.toContain("not null");
});
