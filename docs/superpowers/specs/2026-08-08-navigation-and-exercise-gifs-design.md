# Navigation + Exercise GIFs — Design

Date: 2026-08-08

## Goal

Two independent improvements to the existing app:

1. **Navigation** — replace the hub-and-spoke home screen with a persistent
   bottom tab bar plus a top header, so the main sections are reachable from
   anywhere.
2. **Exercise GIFs** — show the animated GIF (not the static PNG) while an
   exercise is running in the Player.

---

# Part 1 — Navigation

## Current state

`src/app/_layout.tsx` renders a single `Stack` with `headerShown: false`. All
navigation is manual: the home screen lists three `NavCard`s that `push` into
routes, and each screen carries its own buttons. There is no persistent
navigation — from Workouts or Library the only way to another section is back
to Home.

## Structure

Add `src/app/(app)/_layout.tsx` holding a `Tabs` navigator. Route files do not
move:

```
src/app/(app)/_layout.tsx      NEW — Tabs navigator
  index.tsx                    tab "Home"
  workouts.tsx                 tab "Workouts"
  history.tsx                  tab "History"
  library.tsx                  tab "Browse"
  builder.tsx                  hidden from bar (href: null), header with back
  player/[id].tsx              hidden from bar, no tab bar, no header
```

The root `src/app/_layout.tsx` keeps its `Stack` and auth `Gate` unchanged —
the `(app)` group becomes one stack entry that internally renders tabs. The
`(auth)/login` route is outside the group and gains no tabs.

### No new navigation dependency

`@react-navigation/bottom-tabs` is **not** installed and must not be added. In
SDK 56+ Expo Router vendors it internally
(`expo-router/build/react-navigation/bottom-tabs`), and the SDK 57 docs state
that importing from external `@react-navigation/*` packages in application code
is no longer supported. `import { Tabs } from "expo-router"` is the correct and
sufficient import. Verified present in `node_modules`, along with the
`href`, `tabBarStyle`, and `headerShown` options used below.

### Icons — the one new dependency

No icon library is installed (`@expo/vector-icons` is absent from
`package.json` and `node_modules`). Tabs need icons, so add it with
`npx expo install @expo/vector-icons`. Use `Ionicons`, one glyph per tab:

| Tab      | Route      | Icon (focused / unfocused)        |
|----------|------------|----------------------------------|
| Home     | `index`    | `home` / `home-outline`          |
| Workouts | `workouts` | `barbell` / `barbell-outline`    |
| History  | `history`  | `time` / `time-outline`          |
| Browse   | `library`  | `search` / `search-outline`      |

## Header

Tab screens show a top header with the screen title. `builder` shows a header
with a back button. Header styling comes from existing theme tokens:
background `colors.surface`, tint `colors.text`, bottom border `colors.border`,
title weight `700`.

**The Player has no header.** It is a deliberately immersive full-bleed
work/rest screen and already carries Exit, Back, Pause, and Skip controls; a
header would break the design and duplicate an existing control. This is the
one intentional exception to "header everywhere".

## Screen changes

**`index.tsx` (Home tab):** remove the three `NavCard`s and the local
`NavCard` component — the tabs replace them. Keep the greeting
("Logged in as …") and Log out.

**All tab screens + builder:** remove the in-body `<ScreenTitle>` (5
occurrences: `index.tsx:24` "Padel HIIT", `library.tsx:7` "Exercises",
`builder.tsx:108` "New workout", `history.tsx:43` "History",
`workouts.tsx:36` "My workouts"). The navigator header now supplies the
title; keeping both would render it twice. `ScreenTitle` itself stays exported
in `components/ui.tsx` — it is still the right primitive, just no longer used
by these screens.

Header titles reuse those exact strings, except Home, whose header title is
**"Padel HIIT"** while its tab label is **"Home"**.

## Testing

Existing screen tests render each screen component directly rather than
through the layout, so the navigator's header never enters the test tree and
no duplicate-text collision occurs. Removing the in-body titles is safe: no
test queries them. (`"Padel HIIT"` in `workouts.test.tsx` is mock workout
*data*, not the heading.)

New test — `src/app/__tests__/app-layout.test.tsx`: render the `(app)` layout
with `Tabs` mocked, and assert the four visible tabs are registered with their
expected names and titles, and that `builder` and `player/[id]` are registered
with `href: null`. This pins the tab set and the hidden-route contract without
depending on navigator internals.

---

# Part 2 — Exercise GIFs

## What the upstream API actually provides

Verified against the live AscendAPI on 2026-08-08.

The **list** endpoint we currently sync from returns only `imageUrl`, a static
`.png` — which is why every stored `media_url` is a PNG. The **detail**
endpoint `/api/v1/exercises/{exerciseId}` additionally returns:

```json
{
  "imageUrls": { "360p": "…png", "480p": "…png", "720p": "…png", "1080p": "…png" },
  "gifUrls":   { "360p": "…gif", "480p": "…gif", "720p": "…gif", "1080p": "…gif" },
  "overview":  "The barbell standing close grip curl is …"
}
```

GIFs exist, but only per-exercise. There is no derivable GIF URL: probing
`.gif`, `.webp`, `.mp4`, and query-param variants of a stored PNG URL all
return 404. Query params on the list endpoint (`includeGifs`, `gif`, `media`)
are ignored.

Measured GIF sizes: 360p 264KB, 480p 656KB, **720p 883KB**, 1080p 1.8MB.
**Use 720p.** `overview` is out of scope.

## Data model

Migration `0009_exercise_gif_url.sql`:

```sql
alter table exercises add column gif_url text;
```

Nullable. `media_url` keeps its current role (static PNG, used for list
thumbnails); `gif_url` is the animated asset used by the Player. Both remain
upstream hotlinks — **never re-hosted**, per the existing licensing rule. No
RLS or grant changes: the column is additive on an existing table.

## Sync change

`supabase/functions/sync-exercises/` gains a second phase per page: after
upserting a page, fetch each exercise's detail endpoint and update its
`gif_url`. ~30 extra requests for the current 30-exercise catalog, well within
the free tier.

New pure helper in `map.ts`, unit-testable with no network:

```ts
export function pickGifUrl(detail: unknown): string | null
```

Returns `data.gifUrls["720p"]` when present, else `null` — tolerating a
missing `gifUrls`, a missing `720p` key, or a non-string value rather than
throwing. `mapExerciseToRow` is unchanged.

A detail fetch that fails or 404s leaves `gif_url` null and must not abort the
sync: a missing GIF degrades to the PNG, so one bad exercise cannot break the
whole catalog. Non-OK page fetches keep today's fail-loudly behaviour.

## Read path

`CatalogExercise` (`src/lib/catalog.ts`) and `EngineExercise`
(`src/lib/workout-engine.ts`) each gain `gifUrl: string | null`, mapped from
`r.gif_url ?? null` wherever exercises are read (`catalog.ts`, and the nested
select in `workouts.ts`).

The Player prefers the GIF and falls back to the PNG. In
`src/app/(app)/player/[id].tsx`, `animationUrl` becomes:

```ts
const animationUrl =
  call?.mediaUrl ?? (step!.kind === "work"
    ? step!.exercise.gifUrl ?? step!.exercise.mediaUrl
    : null);
```

Reaction call-out media (`call?.mediaUrl`) keeps top priority — unchanged.

`expo-image` renders animated GIFs natively on iOS, Android, and web with no
extra prop, so the existing `<Image>` usage needs no change beyond the URL.

## History snapshot compatibility

History snapshots embed exercises, so snapshot exercises gain an **optional**
`gifUrl`. Existing stored snapshots simply lack the field and fall back to
their PNG. **No `version` bump and no migration of stored history** — the
addition is backward compatible by construction. `toSnapshot` passes `gifUrl`
through with the other exercise fields.

## Unchanged

- **Library and ExercisePicker** keep static PNGs — light, smooth scrolling.
  Only the Player animates.
- The four padel reaction exercises have no media at all and are unaffected;
  their `gif_url` stays null.

## Testing

- `pickGifUrl` — extracts `720p`; returns null for missing `gifUrls`, missing
  `720p`, and non-string values.
- `mapExerciseToRow` — existing tests still pass (unchanged behaviour,
  including the hotlink-verbatim assertion).
- `catalog.ts` / `workouts.ts` — `gifUrl` maps from `gif_url`, null when absent.
- `toSnapshot` — carries `gifUrl` through.
- Migration static test `schema-0009.test.ts` — asserts the file adds
  `gif_url` to `exercises`, matching the `schema-0006/0007/0008` convention.
- Player GIF-preference logic: the existing suite has documented
  FlatList/timer flakiness, so cover the precedence rule
  (`call` > `gifUrl` > `mediaUrl`) where it is directly testable rather than
  adding a heavy render test.

---

## Live deployment steps (after code lands)

1. Apply `0009` via Management API
   `POST /v1/projects/ppgjvqoutuxwhvhyaqhj/database/query` (the direct DB host
   does not resolve in this environment).
2. Redeploy `sync-exercises`.
3. Re-invoke it to backfill `gif_url` for the 30 standard exercises.

`SUPABASE_ACCESS_TOKEN` is available and `RAPIDAPI_KEY` is already set as a
project secret, so all three steps are executable. Migration files remain the
reproducible source of truth.

## Out of scope

- The `overview` description text from the detail endpoint.
- Animating Library/picker thumbnails.
- User-selectable GIF resolution or a data-saver setting.
- Re-hosting or caching media (licensing — hotlink only).
- Deep-linking or drawer navigation beyond the four tabs.
