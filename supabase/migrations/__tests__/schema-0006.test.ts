import { readFileSync } from "fs";
import { join } from "path";

const raw = readFileSync(join(__dirname, "..", "0006_seed_padel_reaction.sql"), "utf8");
const sql = raw.toLowerCase();

test("seeds a reaction exercise from the padel source", () => {
  expect(sql).toContain("insert into exercises");
  expect(sql).toContain("'reaction'");
  expect(sql).toContain("'padel'");
});

test("is idempotent via the (source, external_id) conflict target", () => {
  expect(sql).toContain("on conflict (source, external_id)");
  expect(sql).toContain("do update");
});

test("pool holds the four padel shots in the shape readPool expects", () => {
  for (const call of ["Volley", "Low volley", "Block", "Low chiquita"]) {
    expect(raw).toContain(`"call": "${call}"`);
  }
  // readPool reads media_url / audio_url off each pool entry.
  expect(raw).toContain('"media_url"');
  expect(raw).toContain('"audio_url"');
});
