import { readFileSync } from "fs";
import { join } from "path";

const raw = readFileSync(join(__dirname, "..", "0007_split_padel_reaction_shots.sql"), "utf8");
const sql = raw.toLowerCase();

test("removes the pooled padel_reaction_shots drill", () => {
  expect(sql).toContain("delete from exercises");
  expect(sql).toContain("padel_reaction_shots");
});

test("inserts the four shots as separate named reaction exercises", () => {
  for (const name of ["Volley", "Low volley", "Block", "Low chiquita"]) {
    expect(raw).toContain(`'${name}'`);
  }
  expect(sql).toContain("'reaction'");
  expect(sql).toContain("'padel'");
});

test("each exercise carries a one-call pool in the shape readPool expects", () => {
  for (const call of ["Volley", "Low volley", "Block", "Low chiquita"]) {
    expect(raw).toContain(`"call": "${call}"`);
  }
  expect(raw).toContain('"media_url"');
  expect(raw).toContain('"audio_url"');
});

test("is idempotent via the (source, external_id) conflict target", () => {
  expect(sql).toContain("on conflict (source, external_id)");
  expect(sql).toContain("do update");
});
