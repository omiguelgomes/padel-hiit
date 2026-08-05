-- Timing moves from per-block to per-workout: one work interval, one
-- rest-between-exercises interval, one set count, and one reaction call-out
-- range for the whole circuit. A block is now just an ordered exercise slot.

alter table workouts
  add column work_secs int not null default 30,
  add column rest_secs int not null default 10,
  add column sets int not null default 1,
  add column reaction_min_secs int,
  add column reaction_max_secs int;

alter table workout_blocks
  drop column work_secs,
  drop column rest_secs,
  drop column rounds,
  drop column sets,
  drop column reaction_min_secs,
  drop column reaction_max_secs;
