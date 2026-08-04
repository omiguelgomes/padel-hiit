import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(join(__dirname, "..", "0002_exercise_external_id.sql"), "utf8").toLowerCase();

test("adds external_id column to exercises", () => {
  expect(sql).toContain("alter table exercises");
  expect(sql).toContain("external_id");
});

test("adds a unique index on (source, external_id) for idempotent upserts", () => {
  expect(sql).toContain("unique");
  expect(sql).toContain("source, external_id");
});
