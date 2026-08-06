-- History is a self-contained session record, fully decoupled from workouts.
-- The soft link back to the source workout is removed; settings_snapshot is a
-- complete copy of the workout as run.
alter table workout_history
  drop column workout_id;
