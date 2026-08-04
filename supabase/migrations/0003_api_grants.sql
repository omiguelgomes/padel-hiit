-- The project has "auto-expose new tables" disabled, so the API roles (anon,
-- authenticated) receive no table privileges automatically. RLS still governs
-- which ROWS a user sees; these GRANTs give the roles table-level access so the
-- policies from 0001 can take over. Without them, PostgREST returns 401
-- "permission denied for table" before any policy is ever evaluated.

grant usage on schema public to anon, authenticated;

-- Built-in exercises (owner_id null) are readable by everyone; the read policy
-- narrows rows. Only signed-in users create/modify their own exercises.
grant select on table exercises to anon, authenticated;
grant insert, update, delete on table exercises to authenticated;

-- Per-user data: authenticated role gets full table access, RLS scopes to owner.
grant select, insert, update, delete on table profiles to authenticated;
grant select, insert, update, delete on table workouts to authenticated;
grant select, insert, update, delete on table workout_blocks to authenticated;
grant select, insert, update, delete on table workout_history to authenticated;
