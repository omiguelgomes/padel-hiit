-- External id ties a cached ExerciseDB row to its upstream exerciseId, so
-- re-syncing updates in place instead of duplicating. Null for padel/custom.
alter table exercises add column external_id text;

-- Unique per source. Padel/custom rows have external_id null; Postgres treats
-- nulls as distinct, so many null-external_id rows coexist without conflict.
-- This index is the arbiter for upsert(..., { onConflict: 'source,external_id' }).
create unique index exercises_source_external_id_key
  on exercises (source, external_id);
