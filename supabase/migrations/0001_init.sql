-- Profiles: one per auth user
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

-- Exercises: standard, padel, or reaction — all share this table.
-- config holds reaction pools: { pool: [ {call, media_url, audio_url} ] }
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('standard', 'reaction')),
  source text not null check (source in ('exercisedb', 'padel', 'custom')),
  media_url text,               -- exercisedb hotlink OR our storage URL
  config jsonb not null default '{}'::jsonb,
  owner_id uuid references profiles(id) on delete cascade,  -- null = built-in
  created_at timestamptz not null default now()
);

create table workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table workout_blocks (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts(id) on delete cascade,
  "order" int not null,
  exercise_id uuid not null references exercises(id) on delete restrict,
  work_secs int not null,
  rest_secs int not null,
  rounds int not null default 1,
  sets int not null default 1,
  reaction_min_secs int,        -- reaction blocks only
  reaction_max_secs int
);

-- Immutable: settings_snapshot is a full copy of the workout as run.
create table workout_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  workout_id uuid references workouts(id) on delete set null,
  completed_at timestamptz not null default now(),
  settings_snapshot jsonb not null
);

-- Row level security
alter table profiles enable row level security;
alter table exercises enable row level security;
alter table workouts enable row level security;
alter table workout_blocks enable row level security;
alter table workout_history enable row level security;

-- Profiles: a user sees and edits only their own row
create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- Exercises: everyone reads built-ins (owner_id null) and their own; writes own
create policy "read exercises" on exercises
  for select using (owner_id is null or owner_id = auth.uid());
create policy "write own exercises" on exercises
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Workouts / blocks / history: scoped to owner
create policy "own workouts" on workouts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own blocks" on workout_blocks
  for all using (
    exists (select 1 from workouts w where w.id = workout_id and w.owner_id = auth.uid())
  ) with check (
    exists (select 1 from workouts w where w.id = workout_id and w.owner_id = auth.uid())
  );
create policy "own history" on workout_history
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Auto-create a profile row when a new auth user signs up
create function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
