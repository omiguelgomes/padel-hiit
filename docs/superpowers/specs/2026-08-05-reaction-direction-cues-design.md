# Reaction Direction Cues — Design

**Date:** 2026-08-05
**Status:** Approved (design), pending spec review

## Problem

Reaction exercises (Volley, Low volley, Block, Low chiquita) currently only
speak their shot name at random intervals during a workout. There's no
reactive *target* — nothing that makes the player move a direction on cue.
The original idea was per-shot uploaded clips, but that needs a whole
media pipeline (Supabase Storage, upload UI, hosting) for little payoff.

## Goal

Give reaction work steps a reactive directional cue drawn **entirely
in-app** — no media, no storage, no uploads, no authoring. On each
call-out the player picks a random direction, speaks it, and flashes a
simple court graphic (a tennis ball positioned left/center/right with a
net below) for about a second.

## Model

A reaction exercise is unchanged in the database — it keeps its
`config.pool` of shot call-outs. The direction is **not** stored or
authored; it's chosen at play time by the app. This means every existing
and future reaction exercise gets the cue for free, with zero data
changes.

- **Directions:** `"left" | "center" | "right"`, chosen at random per
  call-out.
- **Spoken:** the direction only ("Left" / "Center" / "Right"). The shot
  name is already shown large above, so only the changing target is
  announced. This replaces today's behaviour of speaking the shot name on
  each call-out.
- **Visual:** a ~1-second flash in the player's central area (replacing the
  countdown timer briefly), then revert to the normal step view. The flash
  shows a tennis ball positioned by direction with a net bar below it,
  drawn with plain React Native Views (no new dependencies, identical on
  web and native).

## Components

### 1. Direction helper — `src/lib/reaction.ts`

Add a pure helper alongside the existing `pickMove` / `nextDelayMs`:

```ts
export type ReactionDirection = "left" | "center" | "right";

export function pickDirection(
  rnd: () => number = Math.random,
): ReactionDirection {
  const dirs: ReactionDirection[] = ["left", "center", "right"];
  return dirs[Math.floor(rnd() * dirs.length)];
}
```

- Injectable RNG, matching the existing helpers, so it's deterministic
  under test.
- No change to `ReactionMove`, `readPool`, `pickMove`, or `nextDelayMs`.

### 2. Court graphic — `src/components/CourtFlash.tsx` (new)

A presentational component that draws the court scene, positioned by a
`direction` prop.

```ts
type CourtFlashProps = { direction: ReactionDirection };
```

- Renders with plain React Native `View`s styled from `../theme`:
  - A **tennis ball** — a small yellow-green circle — horizontally aligned
    left / center / right per `direction`.
  - A **net** — a horizontal striped/solid bar below the ball, spanning the
    width.
  - A framed court area (bordered box, light surface) so the ball and net
    read as a mini court.
- No animation library, no SVG, no media. Pure layout + color.
- Stateless and pure: same `direction` → same render. Easy to snapshot or
  query in tests.

### 3. Player — `src/app/(app)/player/[id].tsx`

The reaction driver already fires call-outs on random intervals during a
reaction work step. Change what happens on each call-out:

- **Pick a direction** with `pickDirection()` and store it in a
  short-lived state (e.g. `flashDir: ReactionDirection | null`).
- **Speak the direction** — `speak(direction)` — instead of the shot name.
  (The `move.audioUrl == null` recorded-audio branch is unchanged in
  spirit; we just speak the direction string.)
- **Show the flash:** when `flashDir` is set, the central area renders
  `<CourtFlash direction={flashDir} />` in place of the countdown timer.
  A timeout (~1000ms) clears `flashDir` back to `null`, reverting to the
  normal timer view.
- The existing call-out `move` state (for the shot label) and the reaction
  interval scheduling stay as they are; direction is layered on top.
- Flash timers must be cleaned up on unmount / step change / pause, like
  the existing reaction `setTimeout` (clear on effect teardown) so they
  don't fire after the step ends.

Non-reaction steps and the rest of the player (countdown, beep, pause /
skip / back, complete / empty states) are unchanged.

## Out of scope

- Supabase Storage, clip/image upload, any media hosting.
- Per-shot **authored** media or directions — direction is always random.
- The `media_url` / `audio_url` pool fields — they stay null and unused for
  reaction shots (the generic exercise `mediaUrl` animation for *standard*
  exercises is untouched).
- Recorded-voice call-outs (still deferred as before).

## Testing

- **`reaction.ts`:** unit-test `pickDirection` — with a seeded/stubbed RNG,
  assert it maps the unit interval across the three values (e.g. rnd → 0 =
  left, ~0.5 = center, ~0.99 = right), matching the existing injected-RNG
  test style.
- **`CourtFlash`:** render for each direction and assert the ball's
  alignment differs (queryable via testID or style), and the net renders.
- **Player:** extend the existing player reaction test — on a reaction work
  step call-out, assert a direction is spoken and the court flash renders,
  then clears after the timeout. Reuse the existing fake-timer / act
  handling in that suite.
- Same jest invocation as the rest of the project (run from repo root):
  `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`.
