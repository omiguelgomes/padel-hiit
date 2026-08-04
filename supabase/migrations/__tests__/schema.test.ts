import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(join(__dirname, "..", "0001_init.sql"), "utf8");

test.each([
  "create table profiles",
  "create table exercises",
  "create table workouts",
  "create table workout_blocks",
  "create table workout_history",
])("defines %s", (fragment) => {
  expect(sql.toLowerCase()).toContain(fragment);
});

test("enables row level security on user tables", () => {
  expect(sql.toLowerCase()).toContain("enable row level security");
});

test("stores history as an immutable snapshot", () => {
  expect(sql.toLowerCase()).toContain("settings_snapshot");
});
