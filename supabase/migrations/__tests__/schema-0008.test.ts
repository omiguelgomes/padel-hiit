import { readFileSync } from "fs";
import { join } from "path";

const raw = readFileSync(join(__dirname, "..", "0008_history_decouple.sql"), "utf8");
const sql = raw.toLowerCase();

test("drops the workout_id column from workout_history", () => {
  expect(sql).toContain("alter table workout_history");
  expect(sql).toContain("drop column workout_id");
});
