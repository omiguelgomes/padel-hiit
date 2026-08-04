# Padel HIIT Workout App — Design

**Date:** 2026-08-04
**Status:** Approved (design), pending spec review

## 1. Purpose

A cross-platform interval-workout app for padel/tennis players. Users build and
run HIIT (and later, other) workouts, watch an animation of each exercise while
performing it, and do reaction exercises where the app randomly calls out a move
(e.g. "Forehand!" / "Backhand!") for the user to react to. Progress syncs across
devices via user accounts.

The app is personal-first but published publicly: web first, then iOS + Android
app stores.

## 2. Scope

### v1 (must-have)
- Accounts + cloud sync
- Build custom HIIT/interval workouts: work time, rest time, rounds, sets,
  exercise selection, ordering
- Run a workout with a timer, looping exercise animation, and audio cues
- **Reaction exercises** as a normal exercise type: while working, the app calls
  out a random move from that exercise's pool at a configurable random interval,
  speaks it (TTS), and swaps the animation
- Workout history: immutable snapshot of the workout as run, with "repeat"
- Exercise library: generic moves from ExerciseDB (metadata cached, media
  hotlinked) plus the user's own padel/reaction moves
- In-app upload/admin path for adding padel moves

### Explicitly out of v1 (deferred)
- **Gamification** (points, streaks, badges) — mechanics undecided; data model
  leaves room
- **Pre-built workout suggestions** (default tennis/running templates)
- **Recorded voice files** — v1 uses device TTS; audio layer is pluggable so
  files can be dropped in later
- **Native app-store builds** — web ships first; iOS/Android packaging is a
  fast-follow via the same Expo codebase
- **Non-HIIT workout types** — v1 nails HIIT/interval; generalizes later

## 3. Tech stack

- **Client:** Expo (React Native) + React Native Web → one codebase for iOS,
  Android, and web (mobile + desktop). Chosen because it makes web-first *and*
  painless store publishing *and* reaction-mode audio/timing all land on the
  easy path, with minimal ongoing maintenance.
- **Backend:** Supabase — hosted Postgres, Auth (email login), file Storage, and
  Edge Functions. Generous free tier, almost nothing to operate.
- **Exercise data:** ExerciseDB free API, accessed only through a Supabase Edge
  Function (hides any key, centralizes caching, shields the app from upstream
  changes).

## 4. Architecture

```
┌─────────────────────────────────────────────┐
│  Expo app (one codebase)                      │
│  → iOS · Android · Web (mobile + desktop)     │
│                                               │
│  Screens:  Library · Workout Builder ·        │
│            Player · History · Auth            │
└───────────────┬───────────────────────────────┘
                │ HTTPS
┌───────────────▼───────────────────────────────┐
│  Supabase                                      │
│  • Auth (email login)                          │
│  • Postgres: workouts, blocks, exercises,      │
│    history, profiles                           │
│  • Storage: user's own padel clips (+ later,   │
│    recorded voice files)                       │
│  • Edge Function: fetch ExerciseDB, cache      │
│    METADATA only (media stays hotlinked)       │
└────────────────────────────────────────────────┘
```

### Cleanly separable units
1. **Exercise catalog** — a unified store where an ExerciseDB move, a padel
   move, and a reaction move all present the same shape
   (`{id, name, type, media, config}`) to the rest of the app.
2. **Workout engine** — pure logic that flattens a workout definition into a
   timed sequence of steps. No UI. Independently unit-testable.
3. **Player** — renders whatever the engine emits (current move, animation,
   timer, "up next", call-outs). A "reaction driver" submodule activates only
   for reaction-type steps.

## 5. Media & licensing strategy

ExerciseDB's free tier does **not** clearly grant rights to re-host/redistribute
their GIFs. Therefore:

- **Cache metadata only** (name, target, equipment, media URL) in Postgres —
  factual data, makes browse/search fast.
- **Hotlink the GIF** directly from ExerciseDB's URL at display time (optional
  short device-side cache for performance). We never re-host it.
- **Store only the user's own padel clips** in Supabase Storage — the user owns
  these.

Upgrade path (no rewrite): if the free API rate-limits/changes, buy ExerciseDB's
paid dataset license, which explicitly permits self-hosting. Everything flows
through the one Edge Function, so only that changes.

## 6. Data model (Postgres)

Every exercise looks identical to the app via a shared `exercises` table with a
`type` and a flexible `config`.

```
exercises
  id, name, type,               -- type: 'standard' | 'reaction'
  source,                       -- 'exercisedb' | 'padel' | 'custom'
  media_url,                    -- ExerciseDB hotlink OR our Supabase clip
  config (jsonb),               -- reaction pool lives here (see below)
  owner_id                      -- null = built-in, visible to everyone

  -- Reaction example — "Reaction Swing":
  --   type: 'reaction'
  --   config: { pool: [
  --     {call:'Forehand', media_url:'.../fh.mp4', audio_url:null},
  --     {call:'Backhand', media_url:'.../bh.mp4', audio_url:null} ] }
  -- audio_url null → device TTS; set later → play recorded file

workouts
  id, name, owner_id, created_at

workout_blocks                  -- ordered steps inside a workout
  id, workout_id, order,
  exercise_id,
  work_secs, rest_secs,
  rounds, sets,
  reaction_min_secs,            -- random call-out range (reaction blocks only)
  reaction_max_secs

workout_history                 -- one row per completed run
  id, owner_id, workout_id,
  completed_at,
  settings_snapshot (jsonb)     -- full copy of the workout AS RUN

profiles
  id (= auth user), display_name, created_at
```

### Key decisions
- **History is immutable.** `settings_snapshot` is a full copy, not a link.
  Editing/deleting a workout never alters past history; "repeat" rebuilds from
  the snapshot.
- **Reaction pool is per-exercise; call-out timing is per-block.** The pool
  (forehand/backhand) belongs to the "Reaction Swing" exercise. The random
  interval (e.g. 2–5s) is set when the exercise is dropped into a workout.
- **No gamification tables in v1** — added later without disturbing this schema.

## 7. Workout engine & Player

### Engine (pure logic)
Takes a workout definition and flattens it into a plain list of timed steps,
expanding rounds and sets and applying rest correctly (e.g. no trailing rest
after the final round). Emits: current step, next step, seconds remaining.
Knows nothing about the UI → fully unit-testable.

Example:
```
Workout: "Padel HIIT"
  Block 1: Jumping Jacks — work 30s, rest 10s, 3 rounds
  Block 2: Reaction Swing — work 40s, rest 15s, 2 rounds, call every 2–5s
             ↓ flattens to ↓
  JJ 30 → rest 10 → JJ 30 → rest 10 → JJ 30 →
  Swing 40 → rest 15 → Swing 40 → done
```

### Player (renders engine output)
- Large countdown timer, current exercise name, looping animation while working
- "Up next" preview during rest
- Audio cues (countdown beeps, "rest", next exercise) — essential since the
  phone is often across the room
- Pause / skip / back

### Reaction driver (submodule, active only for reaction steps)
- While the work timer runs, a sub-timer fires at a random interval within the
  block's min/max range
- On each fire: pick a random move from the exercise's pool, **speak the call**
  (device TTS by default; play the move's recorded audio file if one exists),
  swap the animation, flash it on screen
- Work/rest/rounds behave identically to a standard exercise — call-outs simply
  ride on top

### Audio abstraction
Call-out audio is pluggable: device TTS is the default; if a pool move has an
`audio_url`, that recorded file plays instead. Adding recorded voice later is
just uploading files — no code rework.

## 8. Exercise library & padel content pipeline

- **Browse/search** in-app: generic moves from cached ExerciseDB metadata (media
  hotlinked); padel/reaction moves from our own records.
- **Adding a padel move** (user workflow): create the animation file → upload via
  an in-app admin/upload path → set name/type → for reaction moves, define the
  pool (e.g. Reaction Swing → forehand + backhand, each pointing at its clip).
- Built-in moves (`owner_id = null`) are visible to everyone; custom moves are
  owned by their creator.

## 9. Launch order

Web first (usable in browsers, mobile + desktop) → then package for iOS/Android
app stores as a fast-follow. Same Expo codebase throughout.

## 10. Pre-launch checklist (must clear before public ship)

- [ ] Read exercisedb.io/terms in full; confirm hotlinking is permitted (and
      whether attribution is required). If not permitted, switch to the paid
      dataset license or an alternative source.
- [ ] Confirm Supabase and Expo free-tier limits are sufficient for expected use.
