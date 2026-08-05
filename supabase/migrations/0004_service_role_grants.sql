-- The sync-exercises Edge Function writes built-in rows as `service_role`.
-- service_role bypasses RLS but NOT table GRANTs, and with "auto-expose new
-- tables" disabled it received none. Without this grant the upsert fails with
-- "permission denied for table exercises" before any row is written.

grant usage on schema public to service_role;
grant select, insert, update, delete on table exercises to service_role;
