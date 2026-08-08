# Navigation, Exercise GIFs + Preview — Design

Date: 2026-08-08

## Goal

Three improvements to the existing app:

1. **Navigation** — replace the hub-and-spoke home screen with a persistent
   bottom tab bar plus a top header, so the main sections are reachable from
   anywhere.
2. **Exercise GIFs** — show the animated GIF (not the static PNG) while an
   exercise is running in the Player.
3. **Exercise preview** — from any exercise list, open a sheet with the
   animated GIF, description, instructions, and the rest of the API metadata.

Parts 2 and 3 share one sync change and one migration, so they belong in a
single plan; Part 1 is independent of both.

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
  "exerciseId": "edb_0LC083m",
  "name": "barbell standing close grip curl",
  "imageUrls": { "360p": "…png", "480p": "…png", "720p": "…png", "1080p": "…png" },
  "gifUrls":   { "360p": "…gif", "480p": "…gif", "720p": "…gif", "1080p": "…gif" },
  "bodyParts": ["upper arms"],
  "targetMuscles": ["biceps"],
  "secondaryMuscles": ["forearms"],
  "equipments": ["barbell"],
  "difficulty": "beginner",
  "exerciseTypes": ["strength"],
  "overview": "The barbell standing close grip curl is a strength exercise that …",
  "instructions": [
    "Step:1 Stand up straight with your feet shoulder-width apart …",
    "Step:2 Keep your elbows close to your torso …"
  ],
  "relatedExerciseIds": ["edb_H1mF3Hs", "edb_pZGnF7P", "…"]
}
```

GIFs exist, but only per-exercise. There is no derivable GIF URL: probing
`.gif`, `.webp`, `.mp4`, and query-param variants of a stored PNG URL all
return 404. Query params on the list endpoint (`includeGifs`, `gif`, `media`)
are ignored.

Measured GIF sizes: 360p 264KB, 480p 656KB, **720p 883KB**, 1080p 1.8MB.
**Use 720p.**

Of the detail-only fields, `overview`, `instructions`, and `exerciseTypes` feed
the preview (Part 3). **`relatedExerciseIds` is excluded:** the free tier caps
our catalog at 30 of ~2000 exercises, and a live check confirmed **0 of the 6**
related IDs for the sample exercise exist in our `exercises` table — they would
render as dead links. Revisit if the plan is ever upgraded.

## Data model

Migration `0009_exercise_gif_url.sql`:

```sql
alter table exercises add column gif_url text;
```

Nullable, and the only schema change. `media_url` keeps its current role
(static PNG, used for list thumbnails); `gif_url` is the animated asset used by
the Player and the preview. Both remain upstream hotlinks — **never
re-hosted**, per the existing licensing rule. No RLS or grant changes: the
column is additive on an existing table.

The remaining new metadata goes into the **existing `config` jsonb**, which
already holds `body_parts`, `target_muscles`, `secondary_muscles`,
`equipments`, and `difficulty`. It gains three keys, keeping all API metadata
in one home:

```
config.overview       string
config.instructions   string[]
config.exercise_types string[]
```

## Sync change

`supabase/functions/sync-exercises/` gains a second phase per page: after
upserting a page, fetch each exercise's detail endpoint and update its
`gif_url` and the enriched `config`. ~30 extra requests for the current
30-exercise catalog, well within the free tier.

New pure helper in `map.ts`, unit-testable with no network:

```ts
export type DetailPatch = {
  gif_url: string | null;
  overview: string;
  instructions: string[];
  exercise_types: string[];
};

export function mapDetailToPatch(detail: unknown): DetailPatch
```

Extracts `data.gifUrls["720p"]`, `data.overview`, `data.instructions`, and
`data.exerciseTypes`, tolerating missing keys and wrong types rather than
throwing: a missing GIF yields `null`, a missing string yields `""`, a missing
or non-array list yields `[]`. `mapExerciseToRow` is unchanged — the patch is
applied as a second update that merges the three keys into the existing
`config`.

A detail fetch that fails or 404s leaves `gif_url` null and `config` at its
list-endpoint values, and must not abort the sync: a missing GIF degrades to
the PNG, so one bad exercise cannot break the whole catalog. Non-OK *page*
fetches keep today's fail-loudly behaviour.

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

- **Exercise list rows** keep static PNG thumbnails — light, smooth scrolling.
  Animation is reserved for the Player and the preview sheet (Part 3).
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

# Part 3 — Exercise preview

## Goal

From any exercise list, open a preview showing the animated GIF, the
description, the instructions, and the rest of the API metadata.

## Trigger — an explicit info button

`ExercisePicker` serves two callers with opposite tap semantics: in **Library**
`onSelect` is a no-op (tapping a row does nothing today), while in **builder**
tapping a row **adds** the exercise to the workout. So "tap the row" cannot mean
preview in both places.

Resolution: each row gains a small **ⓘ info button** that opens the preview.
Row tap keeps its existing per-caller meaning — add in the builder, and in
Library, where it currently does nothing, it also opens the preview so the whole
row is useful there.

`ExercisePicker` gains one optional prop:

```ts
onPreview?: (exercise: CatalogExercise) => void
```

The info button renders only when `onPreview` is supplied, and its `onPress`
calls `e.stopPropagation()` so tapping ⓘ inside a row never also triggers the
row's `onSelect` (an accidental add in the builder). Library passes
`onSelect={preview}` and `onPreview={preview}` — the same handler for both.

## Form — a modal sheet

`src/components/ExercisePreview.tsx` (new) renders a React Native `Modal`
(`animationType="slide"`, `transparent`) over the current screen. A sheet, not a
route, because the builder must not lose an in-progress workout to navigate to a
preview — and the same component then works unchanged from both callers.

Props:

```ts
{ exercise: CatalogExercise | null; onClose: () => void }
```

A null `exercise` renders nothing; the caller holds the selected-exercise state.
No route, no new navigation entry, and nothing in Part 1's tab config changes.

Content, top to bottom, inside a scrollable sheet:

1. **Media** — `gifUrl` if present, else `mediaUrl`, else a soft placeholder
   block. Rendered with `expo-image`, `contentFit="contain"`.
2. **Name** — title case is not applied; names are stored lowercase upstream and
   render as-is, consistent with every existing list.
3. **Close (✕)** button.
4. **Overview** — `config.overview`, omitted when empty.
5. **Instructions** — `config.instructions` as an ordered list. The upstream
   strings carry a `"Step:N "` prefix (e.g. `"Step:1 Stand up straight …"`);
   strip it with a pure helper and render our own numbering, so the copy does
   not read "1. Step:1 …".
6. **Metadata chips** — target muscles, secondary muscles, body parts,
   equipment, difficulty, exercise types. Each group omitted when empty. Chips
   use `colors.primarySoft` background with `colors.primary` text.

Reaction/padel exercises have none of this metadata, so their preview shows the
name and whatever exists — the omit-when-empty rule covers them with no special
case.

## Reading the metadata

`CatalogExercise.config` is already `Record<string, unknown>`, so the preview
needs no type change beyond Part 2's `gifUrl`. Add pure accessors in
`src/lib/catalog.ts` that read `config` defensively — it is upstream-shaped
jsonb, and old rows predate these keys:

```ts
export function readOverview(config: Record<string, unknown>): string
export function readInstructions(config: Record<string, unknown>): string[]
export function readStringList(config: Record<string, unknown>, key: string): string[]
export function stripStepPrefix(instruction: string): string
```

Each returns an empty string/array for a missing key or wrong type rather than
throwing. These mirror `readPool` in `src/lib/reaction.ts`, which already reads
upstream-shaped jsonb this way.

## Screens touched

- **`ExercisePicker.tsx`** — add the ⓘ button and the optional `onPreview`
  prop. Existing callers that omit it are unaffected.
- **`library.tsx`** — hold `preview` state, pass both handlers, render
  `<ExercisePreview>`.
- **`builder.tsx`** — hold `preview` state, pass `onPreview`, render
  `<ExercisePreview>`. Tap-to-add is untouched.

## Testing

- `stripStepPrefix` — strips `"Step:1 "`, `"Step:12 "`; leaves unprefixed text
  alone.
- `readOverview` / `readInstructions` / `readStringList` — extract correct
  values; return empty for missing keys, null config values, and wrong types.
- `ExercisePreview` — renders name, overview, and instruction text for a full
  exercise; renders nothing when `exercise` is null; omits sections whose data
  is empty (a reaction exercise shows no chips); prefers `gifUrl` over
  `mediaUrl`.
- `ExercisePicker` — the ⓘ button appears only with `onPreview` and calls it
  with the right exercise; pressing ⓘ does **not** call `onSelect` (the
  accidental-add guard).
- Existing picker/builder/library tests must keep passing unchanged — the new
  prop is optional. Note the documented FlatList-flush quirk: a synchronous
  state change (e.g. `changeText`) is needed before list rows are queryable.

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

- `relatedExerciseIds` — none of the related exercises are in our 30-exercise
  catalog, so the links would be dead (see Part 2).
- Animating list-row thumbnails; animation is the Player and preview only.
- User-selectable GIF resolution or a data-saver setting.
- Re-hosting or caching media (licensing — hotlink only).
- Deep-linking or drawer navigation beyond the four tabs.
- A preview route/URL — the preview is a sheet, so it is not linkable.
- Upgrading the RapidAPI plan past the 30-exercise free cap.
