# Navigation, Exercise GIFs + Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bottom-tab + header navigation shell, show animated GIFs while an exercise runs, and add an exercise preview sheet with description, instructions and metadata.

**Architecture:** A new `(app)/_layout.tsx` hosts an expo-router `Tabs` navigator; the four main screens become tabs while builder and player stay hidden routes. Migration `0009` adds `exercises.gif_url`, and `sync-exercises` gains a per-exercise detail fetch that fills `gif_url` plus three new `config` jsonb keys. The Player prefers `gifUrl` over `mediaUrl`, and a new `ExercisePreview` modal renders the GIF, overview, instructions and metadata chips from any exercise list.

**Tech Stack:** Expo SDK 57 (React Native + RN Web), expo-router, expo-image, `@expo/vector-icons`, Supabase (Postgres + Edge Functions/Deno), TypeScript, Jest.

**Spec:** `docs/superpowers/specs/2026-08-08-navigation-and-exercise-gifs-design.md`

## Global Constraints

- **Read the versioned docs before writing Expo code:** https://docs.expo.dev/versions/v57.0.0/ (project AGENTS.md mandate).
- **Never install `@react-navigation/bottom-tabs`.** Expo Router SDK 56+ vendors it internally; SDK 57 docs state importing from external `@react-navigation/*` in app code is unsupported. Use `import { Tabs } from "expo-router"`.
- **The only new dependency is `@expo/vector-icons`**, installed with `npx expo install @expo/vector-icons`.
- **Media is hotlinked verbatim, never re-hosted or transformed** (ExerciseDB licensing). This applies to `media_url` and `gif_url` alike.
- **GIF resolution is `720p`** — exactly that key from `gifUrls`.
- **The Player has no navigation header** (`headerShown: false`) — it is deliberately immersive and already has Exit/Back/Pause/Skip.
- **Do not bump the history snapshot `version`.** `gifUrl` is optional on snapshot exercises; old snapshots fall back to PNG.
- **`relatedExerciseIds` is out of scope** — 0 of the sample's 6 related IDs exist in our 30-exercise catalog.
- **Test command:** `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/` (the bare `npx jest` double-crawls `.claude/worktrees/` and reports fake Haste duplicate-module failures). If working inside a worktree under `.claude/worktrees/`, use `npx jest --testPathIgnorePatterns /node_modules/ /eyedropper/` instead.
- **Baseline:** 73 tests across 23 suites pass before this work starts.
- **Reuse theme tokens** from `src/theme.ts` (`colors`, `spacing`, `radius`, `font`, `shadow`, `CONTENT_MAX_WIDTH`) — no hardcoded colors or sizes.
- **Every existing component test mocks `expo-image` as `{ Image: () => null }`.** A mocked-away `Image` renders no props into the tree, so to assert *which* URL is rendered, replace that mock with a props-recording one (shown in Tasks 7 and 9) rather than reaching for `UNSAFE_getAllByType`.
- **Preserve existing user-visible copy** unless a task says otherwise; several tests query by exact text.

## File Structure

**Part 1 — Navigation**
- Create `src/app/(app)/_layout.tsx` — Tabs navigator; owns tab set, icons, header styling, hidden routes.
- Create `src/app/__tests__/app-layout.test.tsx` — pins the tab/hidden-route contract.
- Modify `src/app/(app)/index.tsx` — drop NavCards + local `NavCard`; keep greeting and Log out.
- Modify `src/app/(app)/{workouts,history,library,builder}.tsx` — remove in-body `<ScreenTitle>` (header supplies it).

**Part 2 — GIFs (data + player)**
- Create `supabase/migrations/0009_exercise_gif_url.sql` — `add column gif_url text`.
- Create `supabase/migrations/__tests__/schema-0009.test.ts` — static SQL assertions.
- Modify `supabase/functions/sync-exercises/map.ts` — add `DetailPatch` + `mapDetailToPatch`.
- Modify `supabase/functions/sync-exercises/__tests__/map.test.ts` — cover the new helper.
- Modify `supabase/functions/sync-exercises/index.ts` — second phase: detail fetch → update.
- Modify `src/lib/catalog.ts` — `CatalogExercise.gifUrl`.
- Modify `src/lib/workout-engine.ts` — `EngineExercise.gifUrl`.
- Modify `src/lib/workouts.ts` — select + map `gif_url`.
- Modify `src/app/(app)/player/[id].tsx` — prefer `gifUrl` for `animationUrl`.

**Part 3 — Preview**
- Modify `src/lib/catalog.ts` — pure config accessors (same file as the read layer they parse).
- Create `src/components/ExercisePreview.tsx` — the modal sheet.
- Create `src/components/__tests__/ExercisePreview.test.tsx`.
- Modify `src/components/ExercisePicker.tsx` — optional `onPreview` + ⓘ button.
- Modify `src/components/__tests__/ExercisePicker.test.tsx` (exists) — ⓘ behaviour incl. the no-accidental-add guard.
- Modify `src/app/(app)/library.tsx` and `src/app/(app)/builder.tsx` — wire preview state.

Task order: Part 2's data layer (Tasks 1–5) precedes the Player and preview that consume it. Part 1 is independent and comes first so the app is navigable early.

---

### Task 1: Tabs navigator + header shell

**Files:**
- Create: `src/app/(app)/_layout.tsx`
- Create: `src/app/__tests__/app-layout.test.tsx`
- Modify: `package.json` (adds `@expo/vector-icons`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `(app)` Tabs layout. Later tasks assume tab screens no longer need their own title.

Read https://docs.expo.dev/versions/v57.0.0/sdk/router/ before starting.

- [ ] **Step 1: Install the icon library**

```bash
npx expo install @expo/vector-icons
```

- [ ] **Step 2: Write the failing test**

Create `src/app/__tests__/app-layout.test.tsx`. It mocks `expo-router` so `Tabs` and `Tabs.Screen` record the props they receive, then asserts the registered route set. This pins the contract without rendering a real navigator.

```tsx
const screens: any[] = [];

jest.mock("expo-router", () => {
  const React = require("react");
  const Tabs = ({ children }: any) => React.createElement("Tabs", null, children);
  Tabs.Screen = (props: any) => {
    screens.push(props);
    return null;
  };
  return { Tabs };
});

import { render } from "@testing-library/react-native";
import React from "react";
import AppLayout from "../(app)/_layout";

beforeEach(() => {
  screens.length = 0;
});

test("registers the four main tabs in order with their titles", () => {
  render(<AppLayout />);
  const visible = screens.filter((s) => s.options?.href !== null);
  expect(visible.map((s) => s.name)).toEqual(["index", "workouts", "history", "library"]);
  expect(visible.map((s) => s.options.title)).toEqual([
    "Padel HIIT",
    "My workouts",
    "History",
    "Exercises",
  ]);
  expect(visible.map((s) => s.options.tabBarLabel)).toEqual([
    "Home",
    "Workouts",
    "History",
    "Browse",
  ]);
});

test("hides builder and player from the tab bar", () => {
  render(<AppLayout />);
  const hidden = screens.filter((s) => s.options?.href === null);
  expect(hidden.map((s) => s.name).sort()).toEqual(["builder", "player/[id]"]);
});

test("gives the player no header and no tab bar", () => {
  render(<AppLayout />);
  const player = screens.find((s) => s.name === "player/[id]");
  expect(player.options.headerShown).toBe(false);
  expect(player.options.tabBarStyle).toEqual({ display: "none" });
});

test("gives the builder a header so it can be dismissed", () => {
  render(<AppLayout />);
  const builder = screens.find((s) => s.name === "builder");
  expect(builder.options.headerShown).toBe(true);
  expect(builder.options.title).toBe("New workout");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx jest src/app/__tests__/app-layout.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: FAIL — cannot resolve `../(app)/_layout`.

- [ ] **Step 4: Write the layout**

Create `src/app/(app)/_layout.tsx`:

```tsx
import type { ComponentProps } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../../theme";

// The repo uses the automatic JSX transform (no `import React`), so the React
// type namespace is not in scope — import the type explicitly.
type IoniconName = ComponentProps<typeof Ionicons>["name"];

function tabIcon(focused: IoniconName, unfocused: IoniconName) {
  return ({ color, size, focused: isFocused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={isFocused ? focused : unfocused} size={size} color={color} />
  );
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.surface, borderBottomColor: colors.border },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: "700" },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: "Padel HIIT", tabBarLabel: "Home", tabBarIcon: tabIcon("home", "home-outline") }}
      />
      <Tabs.Screen
        name="workouts"
        options={{ title: "My workouts", tabBarLabel: "Workouts", tabBarIcon: tabIcon("barbell", "barbell-outline") }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "History", tabBarLabel: "History", tabBarIcon: tabIcon("time", "time-outline") }}
      />
      <Tabs.Screen
        name="library"
        options={{ title: "Exercises", tabBarLabel: "Browse", tabBarIcon: tabIcon("search", "search-outline") }}
      />

      {/* Detail routes: reachable by navigation, absent from the tab bar. */}
      <Tabs.Screen name="builder" options={{ href: null, headerShown: true, title: "New workout" }} />
      <Tabs.Screen
        name="player/[id]"
        options={{ href: null, headerShown: false, tabBarStyle: { display: "none" } }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/app/__tests__/app-layout.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS (4 tests).

- [ ] **Step 6: Run the full suite**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all pass (73 baseline + 4 new).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/_layout.tsx" src/app/__tests__/app-layout.test.tsx package.json package-lock.json
git commit -m "feat: bottom tab navigator with header shell"
```

---

### Task 2: Strip duplicate titles and home nav cards

**Files:**
- Modify: `src/app/(app)/index.tsx`
- Modify: `src/app/(app)/workouts.tsx:36`
- Modify: `src/app/(app)/history.tsx:43`
- Modify: `src/app/(app)/library.tsx:7`
- Modify: `src/app/(app)/builder.tsx:108`

**Interfaces:**
- Consumes: the Tabs layout from Task 1 (headers now supply screen titles).
- Produces: no new exports.

Context: the navigator header now renders each screen's title, so the in-body `<ScreenTitle>` would show it twice. `ScreenTitle` stays exported from `src/components/ui.tsx` — it is simply unused by these screens afterwards.

Existing screen tests render screens directly (not through the layout), so no header text enters the test tree and none of these removals should break a test. `"Padel HIIT"` in `workouts.test.tsx` is mock workout *data*, not a heading — leave it alone.

- [ ] **Step 1: Remove the nav cards from Home**

Rewrite `src/app/(app)/index.tsx` to just the greeting and Log out — the tab bar replaces the nav cards, and the header supplies "Padel HIIT". This drops the local `NavCard` component, the three `<NavCard>` elements, the `ScreenTitle`, `useRouter`, and the now-unused `Card`/`font` imports:

```tsx
import { View, Text, Pressable } from "react-native";
import { useAuth } from "../../lib/auth-context";
import { Screen } from "../../components/ui";
import { colors, spacing, font, radius } from "../../theme";

export default function Home() {
  const { signOut, session } = useAuth();
  return (
    <Screen scroll>
      <View style={{ gap: spacing.xs }}>
        <Text style={font.muted}>Logged in as {session?.user.email}</Text>
      </View>

      <Pressable
        onPress={signOut}
        style={({ pressed }) => ({
          padding: spacing.md,
          borderRadius: radius.md,
          alignItems: "center",
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ color: colors.textMuted, fontWeight: "600" }}>Log out</Text>
      </Pressable>
    </Screen>
  );
}
```

- [ ] **Step 2: Remove the four remaining in-body titles**

Delete these lines, and in each file remove `ScreenTitle` from the `components/ui` import if nothing else in the file uses it:

- `src/app/(app)/workouts.tsx:36` → `<ScreenTitle>My workouts</ScreenTitle>`
- `src/app/(app)/history.tsx:43` → `<ScreenTitle>History</ScreenTitle>`
- `src/app/(app)/library.tsx:7` → `<ScreenTitle>Exercises</ScreenTitle>`
- `src/app/(app)/builder.tsx:108` → `<ScreenTitle>New workout</ScreenTitle>`

- [ ] **Step 3: Verify no unused imports remain**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v eyedropper | grep "error TS" | grep -v __tests__ | grep -v __mocks__`
Expected: **no output**. Every `tsc` error in this repo lives in a test or mock file: those compile without jest's ambient types, so `expect`/`test`/`jest` are unresolved — 316 such errors exist at the branch base, and each new test file adds ~14 more. That noise is pre-existing and out of scope, so the check filters it out and asserts on what matters: zero type errors in application source. (Bare `tsc` also reports ~81 errors inside the embedded `eyedropper/` project, which the `grep -v` strips.) Any line of output is a type error YOU introduced — fix it.

- [ ] **Step 4: Run the full suite**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all pass, same count as after Task 1. If a test fails on missing title text, report it rather than re-adding the title — the fix belongs in the test.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/index.tsx" "src/app/(app)/workouts.tsx" "src/app/(app)/history.tsx" "src/app/(app)/library.tsx" "src/app/(app)/builder.tsx"
git commit -m "refactor: drop duplicate screen titles and home nav cards"
```

---

### Task 3: Migration 0009 — exercises.gif_url

**Files:**
- Create: `supabase/migrations/0009_exercise_gif_url.sql`
- Create: `supabase/migrations/__tests__/schema-0009.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `exercises.gif_url` column that Tasks 4–6 read and write.

Do NOT apply this to the live database — that happens after the branch merges (see Post-implementation).

- [ ] **Step 1: Write the failing test**

Create `supabase/migrations/__tests__/schema-0009.test.ts`, matching the `schema-0008.test.ts` convention (static assertions on the SQL text — no DB connection):

```ts
import { readFileSync } from "fs";
import { join } from "path";

const raw = readFileSync(join(__dirname, "..", "0009_exercise_gif_url.sql"), "utf8");
const sql = raw.toLowerCase();

test("adds a nullable gif_url column to exercises", () => {
  expect(sql).toContain("alter table exercises");
  expect(sql).toContain("add column gif_url text");
  expect(sql).not.toContain("not null");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest supabase/migrations/__tests__/schema-0009.test.ts --modulePathIgnorePatterns /.claude/`
Expected: FAIL — `ENOENT` on `0009_exercise_gif_url.sql`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/0009_exercise_gif_url.sql`:

```sql
-- Animated GIF for an exercise, hotlinked from the upstream CDN (never re-hosted).
-- media_url stays the static PNG used for list thumbnails; gif_url is the
-- animated asset shown in the player and the exercise preview.
-- Nullable: padel/reaction exercises have no upstream media, and a missing GIF
-- degrades gracefully to media_url.
alter table exercises add column gif_url text;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest supabase/migrations/__tests__/schema-0009.test.ts --modulePathIgnorePatterns /.claude/`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0009_exercise_gif_url.sql supabase/migrations/__tests__/schema-0009.test.ts
git commit -m "feat: migration 0009 adds exercises.gif_url"
```

---

### Task 4: mapDetailToPatch — parse the detail payload

**Files:**
- Modify: `supabase/functions/sync-exercises/map.ts`
- Modify: `supabase/functions/sync-exercises/__tests__/map.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type DetailPatch = {
    gif_url: string | null;
    overview: string;
    instructions: string[];
    exercise_types: string[];
  };
  export function mapDetailToPatch(detail: unknown): DetailPatch;
  ```
  Task 5 calls this.

Context — the real detail payload from `GET /api/v1/exercises/{exerciseId}` (verified live):

```json
{
  "success": true,
  "data": {
    "exerciseId": "edb_0LC083m",
    "gifUrls":   { "360p": "…VFbvEbq.gif", "480p": "…QrVSQ01.gif", "720p": "…Yt9Fr2L.gif", "1080p": "…13u4Vh5.gif" },
    "overview": "The barbell standing close grip curl is a strength exercise that …",
    "instructions": ["Step:1 Stand up straight …", "Step:2 Keep your elbows …"],
    "exerciseTypes": ["strength"]
  }
}
```

The helper must be **total** — never throw on malformed input. One bad exercise must not break a 30-exercise sync.

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/sync-exercises/__tests__/map.test.ts`:

```ts
import { mapDetailToPatch } from "../map";

const detail = {
  success: true,
  data: {
    exerciseId: "edb_0LC083m",
    gifUrls: {
      "360p": "https://assets.exercisedb.dev/media/VFbvEbq.gif",
      "480p": "https://assets.exercisedb.dev/media/QrVSQ01.gif",
      "720p": "https://assets.exercisedb.dev/media/Yt9Fr2L.gif",
      "1080p": "https://assets.exercisedb.dev/media/13u4Vh5.gif",
    },
    overview: "A strength exercise that targets the biceps.",
    instructions: ["Step:1 Stand up straight.", "Step:2 Curl the bar."],
    exerciseTypes: ["strength"],
  },
};

test("extracts the 720p gif, hotlinked verbatim", () => {
  const patch = mapDetailToPatch(detail);
  // Must be the upstream URL byte-for-byte: any rewrite breaks the licensing rule.
  expect(patch.gif_url).toBe("https://assets.exercisedb.dev/media/Yt9Fr2L.gif");
});

test("extracts overview, instructions and exercise types", () => {
  const patch = mapDetailToPatch(detail);
  expect(patch.overview).toBe("A strength exercise that targets the biceps.");
  expect(patch.instructions).toEqual(["Step:1 Stand up straight.", "Step:2 Curl the bar."]);
  expect(patch.exercise_types).toEqual(["strength"]);
});

test("returns null gif_url when the 720p variant is absent", () => {
  const patch = mapDetailToPatch({ data: { gifUrls: { "360p": "https://x/a.gif" } } });
  expect(patch.gif_url).toBeNull();
});

test("returns empty values for a payload with no detail fields", () => {
  expect(mapDetailToPatch({ data: {} })).toEqual({
    gif_url: null,
    overview: "",
    instructions: [],
    exercise_types: [],
  });
});

test("tolerates malformed input without throwing", () => {
  for (const bad of [null, undefined, "nope", 42, {}, { data: null }]) {
    expect(() => mapDetailToPatch(bad)).not.toThrow();
    expect(mapDetailToPatch(bad).gif_url).toBeNull();
  }
});

test("ignores wrongly-typed fields", () => {
  const patch = mapDetailToPatch({
    data: { gifUrls: { "720p": 5 }, overview: 12, instructions: "not-a-list", exerciseTypes: {} },
  });
  expect(patch).toEqual({ gif_url: null, overview: "", instructions: [], exercise_types: [] });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest supabase/functions/sync-exercises --modulePathIgnorePatterns /.claude/`
Expected: FAIL — `mapDetailToPatch` is not exported.

- [ ] **Step 3: Implement the helper**

Append to `supabase/functions/sync-exercises/map.ts`:

```ts
// The three config keys the detail endpoint contributes, plus the animated URL.
// media_url (static PNG) comes from the list endpoint via mapExerciseToRow.
export type DetailPatch = {
  gif_url: string | null;
  overview: string;
  instructions: string[];
  exercise_types: string[];
};

const GIF_RESOLUTION = "720p";

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// Total by design: the detail endpoint is fetched per-exercise during sync, and
// one malformed or 404 response must not abort the whole catalog.
export function mapDetailToPatch(detail: unknown): DetailPatch {
  const data = asRecord(asRecord(detail).data);
  const gif = asString(asRecord(data.gifUrls)[GIF_RESOLUTION]);
  return {
    gif_url: gif === "" ? null : gif, // hotlink, unchanged
    overview: asString(data.overview),
    instructions: asStringList(data.instructions),
    exercise_types: asStringList(data.exerciseTypes),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest supabase/functions/sync-exercises --modulePathIgnorePatterns /.claude/`
Expected: PASS — the 3 pre-existing `mapExerciseToRow` tests plus 6 new ones.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync-exercises/map.ts supabase/functions/sync-exercises/__tests__/map.test.ts
git commit -m "feat: mapDetailToPatch extracts gif and description metadata"
```

---

### Task 5: Sync phase two — fetch details, enrich rows

**Files:**
- Modify: `supabase/functions/sync-exercises/index.ts`

**Interfaces:**
- Consumes: `mapDetailToPatch(detail: unknown): DetailPatch` and `DetailPatch` from Task 4; `exercises.gif_url` from Task 3.
- Produces: no new exports (Deno entrypoint).

Context: this is a Deno Edge Function, excluded from the app's `tsc` (see `tsconfig.json`) and **not covered by Jest** — the pure logic it calls is tested in Task 4. Verify it by deploying and invoking (see Post-implementation), not by unit test.

Current shape: a `do…while` cursor loop that fetches a page of 25, maps rows with `mapExerciseToRow`, and upserts on conflict `source,external_id`.

- [ ] **Step 1: Add the detail-fetch helper**

In `supabase/functions/sync-exercises/index.ts`, update the import and add a helper above `Deno.serve`:

```ts
import { mapExerciseToRow, mapDetailToPatch, ApiExercise } from "./map.ts";
```

```ts
// Fetch one exercise's detail payload. Returns null on any failure: GIFs and
// descriptions are enrichment, so a single bad response must degrade to the
// static PNG rather than abort a whole sync run.
async function fetchDetail(externalId: string, rapidKey: string) {
  try {
    const res = await fetch(`${API_BASE}/${externalId}`, {
      headers: { "X-RapidAPI-Key": rapidKey, "X-RapidAPI-Host": API_HOST },
    });
    if (!res.ok) return null;
    return mapDetailToPatch(await res.json());
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Enrich each page after upserting it**

Inside the `do…while` loop, immediately after the existing upsert error check and before `synced += rows.length;`, add:

```ts
    // Phase two: the list endpoint has no GIF or description, so fetch each
    // exercise's detail and merge the extra fields into the row we just wrote.
    for (const row of rows) {
      const patch = await fetchDetail(row.external_id, rapidKey);
      if (!patch) continue;

      const { error: detailError } = await supabase
        .from("exercises")
        .update({
          gif_url: patch.gif_url,
          config: {
            ...row.config,
            overview: patch.overview,
            instructions: patch.instructions,
            exercise_types: patch.exercise_types,
          },
        })
        .eq("source", "exercisedb")
        .eq("external_id", row.external_id);
      if (detailError) {
        return new Response(`DB error: ${detailError.message}`, { status: 500 });
      }
    }
```

Note `config` is rebuilt from `row.config` (the list-endpoint facets) plus the three new keys, so the merge is explicit rather than relying on a jsonb partial update.

- [ ] **Step 3: Type-check the app (the function is excluded, so this only proves nothing else broke)**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v eyedropper | grep "error TS" | grep -v __tests__ | grep -v __mocks__`
Expected: **no output** — zero type errors in application source (see Task 2 Step 3 for why test/mock errors are filtered out). Any line of output is a type error you introduced.

- [ ] **Step 4: Run the full suite**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all pass, unchanged count from Task 4.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/sync-exercises/index.ts
git commit -m "feat: sync fetches exercise details for gifs and descriptions"
```

---

### Task 6: Thread gifUrl through the read layer

**Files:**
- Modify: `src/lib/catalog.ts`
- Modify: `src/lib/workout-engine.ts:2-8`
- Modify: `src/lib/workouts.ts:78`, `src/lib/workouts.ts:91`
- Modify: `src/lib/__tests__/catalog.test.ts`
- Modify: `src/lib/__tests__/workouts.test.ts`

**Interfaces:**
- Consumes: `exercises.gif_url` (Task 3).
- Produces: `CatalogExercise.gifUrl: string | null` and `EngineExercise.gifUrl: string | null`. Tasks 7–10 read these. `toSnapshot` carries `gifUrl` through automatically because it passes `detail.exercises` by reference.

- [ ] **Step 1: Write the failing tests**

**`src/lib/__tests__/catalog.test.ts`** — the mock at the top of the file has one `rows` entry (`id: "1"`, `"Push Up"`). Add a second row with no `gif_url` so both the present and absent cases are covered by the same fetch:

```ts
  const rows = [
    {
      id: "1",
      name: "Push Up",
      type: "standard",
      source: "exercisedb",
      media_url: "https://cdn.example.com/pushup.gif",
      gif_url: "https://cdn.example.com/pushup-720p.gif",
      config: { body_parts: ["chest"] },
    },
    {
      id: "2",
      name: "Air Squat",
      type: "standard",
      source: "exercisedb",
      media_url: "https://cdn.example.com/squat.png",
      config: {},
    },
  ];
```

The existing test `"normalizes exercises rows into CatalogExercise shape"` asserts the whole array with `toEqual`, so update it to both rows:

```ts
test("normalizes exercises rows into CatalogExercise shape", async () => {
  const items = await listExercises();
  expect(items).toEqual([
    {
      id: "1",
      name: "Push Up",
      type: "standard",
      source: "exercisedb",
      mediaUrl: "https://cdn.example.com/pushup.gif",
      gifUrl: "https://cdn.example.com/pushup-720p.gif",
      config: { body_parts: ["chest"] },
    },
    {
      id: "2",
      name: "Air Squat",
      type: "standard",
      source: "exercisedb",
      mediaUrl: "https://cdn.example.com/squat.png",
      gifUrl: null,
      config: {},
    },
  ]);
  expect((supabase as any).from).toHaveBeenCalledWith("exercises");
});
```

**`src/lib/__tests__/workouts.test.ts`** — in the `"getWorkout maps settings and ordered exercises"` test, add `gif_url` to the `e2` nested exercise (the one that already has a `media_url`) and leave `e1` without it:

```ts
          exercises: { id: "e2", name: "Reaction Swing", type: "reaction", media_url: "https://x/bh.mp4", gif_url: "https://x/bh-720p.gif", config: { pool: [] } },
```

That test's `expect(out.exercises[0]).toEqual({...})` is exhaustive, so add `gifUrl: null` to it, and assert the mapped GIF:

```ts
  expect(out.exercises[0]).toEqual({
    id: "e1", name: "Jumping Jacks", type: "standard", mediaUrl: null, gifUrl: null, config: {},
  });
  expect(out.exercises[1].mediaUrl).toBe("https://x/bh.mp4");
  expect(out.exercises[1].gifUrl).toBe("https://x/bh-720p.gif");
```

In the same file, the `toSnapshot` test builds a `detail` literal and asserts `exercises: detail.exercises` by reference, so it needs no change — but add `gifUrl` to its two fixture exercises to keep them valid `EngineExercise`s:

```ts
      { id: "e1", name: "Jumping Jacks", type: "standard" as const, mediaUrl: null, gifUrl: null, config: {} },
      { id: "e2", name: "Volley", type: "reaction" as const, mediaUrl: "https://x/v.mp4", gifUrl: "https://x/v-720p.gif", config: { pool: [] } },
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/__tests__/catalog.test.ts src/lib/__tests__/workouts.test.ts --modulePathIgnorePatterns /.claude/`
Expected: FAIL — `gifUrl` is `undefined`.

- [ ] **Step 3: Add the field to both types and both mappers**

In `src/lib/workout-engine.ts`, extend `EngineExercise`:

```ts
export type EngineExercise = {
  id: string;
  name: string;
  type: "standard" | "reaction";
  mediaUrl: string | null;
  gifUrl: string | null;
  config: Record<string, unknown>;
};
```

In `src/lib/catalog.ts`, extend `CatalogExercise` with `gifUrl: string | null;` after `mediaUrl`, and add to the `listExercises` map:

```ts
    gifUrl: r.gif_url ?? null,
```

In `src/lib/workouts.ts:78`, add `gif_url` to the nested select — the exercises sub-select becomes:

```ts
      "id, name, work_secs, rest_secs, sets, reaction_min_secs, reaction_max_secs, workout_blocks(order, exercises(id, name, type, media_url, gif_url, config))",
```

and in the mapper beside `mediaUrl` (line ~91):

```ts
      gifUrl: b.exercises.gif_url ?? null,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/__tests__/catalog.test.ts src/lib/__tests__/workouts.test.ts --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Run the full suite and type-check**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v eyedropper | grep "error TS" | grep -v __tests__ | grep -v __mocks__`
Expected: tests pass, and the tsc check prints **no output** (see Task 2 Step 3). Adding a required field to `EngineExercise` surfaces type errors in other fixtures that build exercise objects — fix each by adding `gifUrl: null`. Known locations: `src/lib/__tests__/workout-engine.test.ts:13` and `:20`, `src/lib/__tests__/history.test.ts:32`, `src/app/__tests__/builder.test.tsx:11`, and the `mockGetWorkout` fixtures in `src/app/__tests__/player.test.tsx:24-25` and `:65-71` (Task 7 revisits the player fixture).

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog.ts src/lib/workout-engine.ts src/lib/workouts.ts src/lib/__tests__/catalog.test.ts src/lib/__tests__/workouts.test.ts
git commit -m "feat: read gif_url into catalog and engine exercises"
```

---

### Task 7: Player shows the GIF

**Files:**
- Modify: `src/app/(app)/player/[id].tsx:186`
- Modify: `src/app/__tests__/player.test.tsx`

**Interfaces:**
- Consumes: `EngineExercise.gifUrl` (Task 6).
- Produces: no new exports.

Context — the current line 186:

```tsx
const animationUrl = call?.mediaUrl ?? (step!.kind === "work" ? step!.exercise.mediaUrl : null);
```

Precedence to implement: reaction call-out media wins (unchanged), then the exercise GIF, then the static PNG. `expo-image` animates GIFs natively on iOS, Android and web with no extra prop, so only the URL changes.

- [ ] **Step 1: Write the failing test**

Add to `src/app/__tests__/player.test.tsx`. The suite has documented timer flakiness, so assert the rendered image URL on the first work step rather than driving timers.

The file currently mocks `expo-image` as `{ Image: () => null }` — a component that renders nothing, so its props never reach the tree. Replace that single line (line 8) with a props-recording mock that renders a queryable node:

```tsx
const imageUris: (string | undefined)[] = [];
jest.mock("expo-image", () => ({
  Image: (props: any) => {
    imageUris.push(props.source?.uri);
    return null;
  },
}));
```

`imageUris` is module-scoped so it survives the mock factory's hoisting. Clear it in the existing `beforeEach`:

```tsx
beforeEach(() => {
  jest.clearAllMocks();
  imageUris.length = 0;
});
```

Then give the first fixture exercise in `mockGetWorkout` (line 24) both URLs, and `gifUrl: null` on the second (line 25):

```tsx
    { id: "e1", name: "Jumping Jacks", type: "standard", mediaUrl: "https://x/jj.png", gifUrl: "https://x/jj-720p.gif", config: {} },
    { id: "e2", name: "High Knees", type: "standard", mediaUrl: null, gifUrl: null, config: {} },
```

Also add `gifUrl: null` to the reaction fixture at lines 65-71 so it type-checks.

New test:

```tsx
test("prefers the animated gif over the static image during a work step", async () => {
  const { findByText } = await render(<Player />);
  await findByText("Jumping Jacks");
  expect(imageUris).toContain("https://x/jj-720p.gif");
  expect(imageUris).not.toContain("https://x/jj.png");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/__tests__/player.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: FAIL — the PNG renders instead of the GIF.

- [ ] **Step 3: Change the precedence**

Replace line 186 of `src/app/(app)/player/[id].tsx`:

```tsx
  // Reaction call-out media wins; otherwise animate the exercise, falling back
  // to its static image when no GIF exists (padel clips, or an enrichment miss).
  const animationUrl =
    call?.mediaUrl ??
    (step!.kind === "work" ? step!.exercise.gifUrl ?? step!.exercise.mediaUrl : null);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/app/__tests__/player.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/player/[id].tsx" src/app/__tests__/player.test.tsx
git commit -m "feat: player animates the exercise gif"
```

---

### Task 8: Config accessors for preview metadata

**Files:**
- Modify: `src/lib/catalog.ts`
- Modify: `src/lib/__tests__/catalog.test.ts`

**Interfaces:**
- Consumes: `CatalogExercise.config: Record<string, unknown>` (existing).
- Produces:
  ```ts
  export function readOverview(config: Record<string, unknown>): string;
  export function readInstructions(config: Record<string, unknown>): string[];
  export function readStringList(config: Record<string, unknown>, key: string): string[];
  export function stripStepPrefix(instruction: string): string;
  ```
  Task 9 renders with these.

Context: `config` is upstream-shaped jsonb and old rows predate these keys, so every accessor must tolerate missing keys and wrong types rather than throw — mirroring `readPool` in `src/lib/reaction.ts`. Upstream instruction strings carry a `"Step:N "` prefix (`"Step:1 Stand up straight …"`); `stripStepPrefix` removes it so the UI can apply its own numbering.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/__tests__/catalog.test.ts`:

```ts
import { readOverview, readInstructions, readStringList, stripStepPrefix } from "../catalog";

test("stripStepPrefix removes the upstream Step:N marker", () => {
  expect(stripStepPrefix("Step:1 Stand up straight.")).toBe("Stand up straight.");
  expect(stripStepPrefix("Step:12 Repeat as needed.")).toBe("Repeat as needed.");
});

test("stripStepPrefix leaves unprefixed text untouched", () => {
  expect(stripStepPrefix("Stand up straight.")).toBe("Stand up straight.");
  expect(stripStepPrefix("")).toBe("");
});

test("readOverview returns the overview, or empty when absent or wrong-typed", () => {
  expect(readOverview({ overview: "A biceps exercise." })).toBe("A biceps exercise.");
  expect(readOverview({})).toBe("");
  expect(readOverview({ overview: 42 })).toBe("");
});

test("readInstructions returns the list, or empty when absent or wrong-typed", () => {
  expect(readInstructions({ instructions: ["Step:1 Go.", "Step:2 Stop."] })).toEqual([
    "Step:1 Go.",
    "Step:2 Stop.",
  ]);
  expect(readInstructions({})).toEqual([]);
  expect(readInstructions({ instructions: "nope" })).toEqual([]);
});

test("readInstructions drops non-string entries", () => {
  expect(readInstructions({ instructions: ["Step:1 Go.", 5, null] })).toEqual(["Step:1 Go."]);
});

test("readStringList reads any string-array facet", () => {
  const config = { target_muscles: ["biceps"], equipments: ["barbell"] };
  expect(readStringList(config, "target_muscles")).toEqual(["biceps"]);
  expect(readStringList(config, "equipments")).toEqual(["barbell"]);
  expect(readStringList(config, "body_parts")).toEqual([]);
  expect(readStringList({ body_parts: {} }, "body_parts")).toEqual([]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/lib/__tests__/catalog.test.ts --modulePathIgnorePatterns /.claude/`
Expected: FAIL — the four functions are not exported.

- [ ] **Step 3: Implement the accessors**

Append to `src/lib/catalog.ts`:

```ts
// `config` is upstream-shaped jsonb and predates these keys on older rows, so
// every accessor degrades to an empty value rather than throwing.

export function readStringList(config: Record<string, unknown>, key: string): string[] {
  const v = config[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function readOverview(config: Record<string, unknown>): string {
  return typeof config.overview === "string" ? config.overview : "";
}

export function readInstructions(config: Record<string, unknown>): string[] {
  return readStringList(config, "instructions");
}

// Upstream ships instructions as "Step:1 Stand up straight." — strip the marker
// so the UI can number them itself instead of rendering "1. Step:1 …".
export function stripStepPrefix(instruction: string): string {
  return instruction.replace(/^Step:\d+\s*/, "");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/lib/__tests__/catalog.test.ts --modulePathIgnorePatterns /.claude/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog.ts src/lib/__tests__/catalog.test.ts
git commit -m "feat: config accessors for preview metadata"
```

---

### Task 9: ExercisePreview modal sheet

**Files:**
- Create: `src/components/ExercisePreview.tsx`
- Create: `src/components/__tests__/ExercisePreview.test.tsx`

**Interfaces:**
- Consumes: `CatalogExercise` (with `gifUrl` from Task 6); `readOverview`, `readInstructions`, `readStringList`, `stripStepPrefix` (Task 8).
- Produces:
  ```tsx
  export default function ExercisePreview(props: {
    exercise: CatalogExercise | null;
    onClose: () => void;
  }): JSX.Element | null;
  ```
  Tasks 10–11 render this.

A sheet rather than a route so the builder never loses an in-progress workout to a preview. The caller owns the selected-exercise state; a null `exercise` renders nothing.

- [ ] **Step 1: Write the failing tests**

Create `src/components/__tests__/ExercisePreview.test.tsx`:

```tsx
import { render, fireEvent } from "@testing-library/react-native";
import React from "react";

// Record what expo-image is asked to render: the sibling tests mock Image away
// as `() => null`, which would hide the very URL these assertions check.
const imageUris: (string | undefined)[] = [];
jest.mock("expo-image", () => ({
  Image: (props: any) => {
    imageUris.push(props.source?.uri);
    return null;
  },
}));

import ExercisePreview from "../ExercisePreview";
import type { CatalogExercise } from "../../lib/catalog";

beforeEach(() => {
  imageUris.length = 0;
});

const full: CatalogExercise = {
  id: "e1",
  name: "barbell standing close grip curl",
  type: "standard",
  source: "exercisedb",
  mediaUrl: "https://cdn.example.com/curl.png",
  gifUrl: "https://cdn.example.com/curl-720p.gif",
  config: {
    overview: "A strength exercise that targets the biceps.",
    instructions: ["Step:1 Stand up straight.", "Step:2 Curl the bar."],
    target_muscles: ["biceps"],
    secondary_muscles: ["forearms"],
    body_parts: ["upper arms"],
    equipments: ["barbell"],
    exercise_types: ["strength"],
    difficulty: "beginner",
  },
};

const bare: CatalogExercise = {
  id: "r1",
  name: "Volley",
  type: "reaction",
  source: "padel",
  mediaUrl: null,
  gifUrl: null,
  config: {},
};

test("renders nothing when no exercise is selected", () => {
  const { toJSON } = render(<ExercisePreview exercise={null} onClose={() => {}} />);
  expect(toJSON()).toBeNull();
});

test("shows the name, overview and instruction text", () => {
  const { getByText } = render(<ExercisePreview exercise={full} onClose={() => {}} />);
  expect(getByText("barbell standing close grip curl")).toBeTruthy();
  expect(getByText("A strength exercise that targets the biceps.")).toBeTruthy();
  expect(getByText("Stand up straight.")).toBeTruthy();
  expect(getByText("Curl the bar.")).toBeTruthy();
});

test("numbers instructions itself and drops the upstream Step:N marker", () => {
  const { queryByText, getByText } = render(<ExercisePreview exercise={full} onClose={() => {}} />);
  expect(queryByText(/Step:1/)).toBeNull();
  expect(getByText("1")).toBeTruthy();
});

test("shows metadata chips", () => {
  const { getByText } = render(<ExercisePreview exercise={full} onClose={() => {}} />);
  for (const chip of ["biceps", "forearms", "upper arms", "barbell", "strength", "beginner"]) {
    expect(getByText(chip)).toBeTruthy();
  }
});

test("prefers the gif over the static image", () => {
  render(<ExercisePreview exercise={full} onClose={() => {}} />);
  expect(imageUris).toContain("https://cdn.example.com/curl-720p.gif");
  expect(imageUris).not.toContain("https://cdn.example.com/curl.png");
});

test("falls back to the static image when there is no gif", () => {
  render(<ExercisePreview exercise={{ ...full, gifUrl: null }} onClose={() => {}} />);
  expect(imageUris).toContain("https://cdn.example.com/curl.png");
});

test("omits empty sections for an exercise with no metadata", () => {
  const { getByText, queryByText } = render(<ExercisePreview exercise={bare} onClose={() => {}} />);
  expect(getByText("Volley")).toBeTruthy();
  expect(queryByText("Instructions")).toBeNull();
  expect(queryByText("biceps")).toBeNull();
});

test("calls onClose when the close button is pressed", () => {
  const onClose = jest.fn();
  const { getByLabelText } = render(<ExercisePreview exercise={full} onClose={onClose} />);
  fireEvent.press(getByLabelText("Close preview"));
  expect(onClose).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/components/__tests__/ExercisePreview.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: FAIL — cannot resolve `../ExercisePreview`.

- [ ] **Step 3: Write the component**

Create `src/components/ExercisePreview.tsx`:

```tsx
import { View, Text, Modal, ScrollView, Pressable } from "react-native";
import { Image } from "expo-image";
import {
  readOverview,
  readInstructions,
  readStringList,
  stripStepPrefix,
  type CatalogExercise,
} from "../lib/catalog";
import { colors, spacing, radius, font, shadow } from "../theme";

function Chips({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null;
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={font.muted}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.xs }}>
        {values.map((v) => (
          <View
            key={v}
            style={{
              backgroundColor: colors.primarySoft,
              paddingVertical: 4,
              paddingHorizontal: spacing.sm,
              borderRadius: radius.pill,
            }}
          >
            <Text style={{ color: colors.primary, fontWeight: "600" }}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function ExercisePreview({
  exercise,
  onClose,
}: {
  exercise: CatalogExercise | null;
  onClose: () => void;
}) {
  if (!exercise) return null;

  const media = exercise.gifUrl ?? exercise.mediaUrl;
  const overview = readOverview(exercise.config);
  const instructions = readInstructions(exercise.config);
  const difficulty = typeof exercise.config.difficulty === "string" ? exercise.config.difficulty : "";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.45)" }}>
        <View
          style={{
            maxHeight: "85%",
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.lg,
            borderTopRightRadius: radius.lg,
            padding: spacing.xl,
            gap: spacing.lg,
            ...shadow,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.md }}>
            <Text style={[font.h3, { flexShrink: 1 }]}>{exercise.name}</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
              style={{ marginLeft: "auto", padding: spacing.xs }}
            >
              <Text style={{ fontSize: 20, color: colors.textMuted, fontWeight: "700" }}>✕</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: spacing.lg }}>
            {media ? (
              <Image
                source={{ uri: media }}
                style={{ width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.bg }}
                contentFit="contain"
              />
            ) : (
              <View
                style={{ width: "100%", height: 220, borderRadius: radius.md, backgroundColor: colors.primarySoft }}
              />
            )}

            {overview ? <Text style={font.body}>{overview}</Text> : null}

            {instructions.length > 0 ? (
              <View style={{ gap: spacing.sm }}>
                <Text style={font.h3}>Instructions</Text>
                {instructions.map((raw, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Text style={{ color: colors.primary, fontWeight: "700" }}>{String(i + 1)}</Text>
                    <Text style={[font.body, { flexShrink: 1 }]}>{stripStepPrefix(raw)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Chips label="Target muscles" values={readStringList(exercise.config, "target_muscles")} />
            <Chips label="Secondary muscles" values={readStringList(exercise.config, "secondary_muscles")} />
            <Chips label="Body parts" values={readStringList(exercise.config, "body_parts")} />
            <Chips label="Equipment" values={readStringList(exercise.config, "equipments")} />
            <Chips label="Exercise types" values={readStringList(exercise.config, "exercise_types")} />
            <Chips label="Difficulty" values={difficulty ? [difficulty] : []} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/components/__tests__/ExercisePreview.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS (8 tests). If `radius.pill` or `shadow` is not exported from `src/theme.ts`, check the real token names there and use the closest existing ones rather than inventing values.

- [ ] **Step 5: Commit**

```bash
git add src/components/ExercisePreview.tsx src/components/__tests__/ExercisePreview.test.tsx
git commit -m "feat: exercise preview sheet with gif, steps and metadata"
```

---

### Task 10: Picker info button

**Files:**
- Modify: `src/components/ExercisePicker.tsx`
- Modify: `src/components/__tests__/ExercisePicker.test.tsx` (already exists — one test, `"lists exercises and calls onSelect when a row is pressed"`; keep it passing unchanged)

**Interfaces:**
- Consumes: `CatalogExercise`.
- Produces: `ExercisePicker` gains an optional prop:
  ```ts
  onPreview?: (exercise: CatalogExercise) => void
  ```
  The ⓘ button renders only when `onPreview` is supplied. Tasks 11 pass it.

**The critical requirement:** in the builder, a row tap **adds** the exercise. An ⓘ inside that row must therefore call `e.stopPropagation()` so previewing never also adds. This is the single most important assertion in this task.

- [ ] **Step 1: Write the failing tests**

Append to the existing `src/components/__tests__/ExercisePicker.test.tsx`. It already mocks `expo-image` and `../../lib/catalog` (fixture: `id: "e1"`, `"Push Up"`) and imports `render, fireEvent, waitFor` — reuse all of it. Add `gifUrl: null` to that fixture at line 7 so it is a valid `CatalogExercise`.

Note the documented FlatList quirk the existing test already works around: rows are not queryable until a synchronous state change flushes the list, so type into the search field first. Add a small helper and four tests:

```tsx
async function renderPicker(props: any) {
  const utils = render(<ExercisePicker {...props} />);
  // Flush the FlatList: rows are not queryable until a sync state change lands.
  fireEvent.changeText(utils.getByPlaceholderText("Search exercises"), "push");
  await waitFor(() => expect(utils.getByText("Push Up")).toBeTruthy());
  return utils;
}

test("shows no info button when onPreview is not supplied", async () => {
  const { queryByLabelText } = await renderPicker({ onSelect: jest.fn() });
  expect(queryByLabelText("Preview Push Up")).toBeNull();
});

test("calls onPreview with the exercise when the info button is pressed", async () => {
  const onPreview = jest.fn();
  const { getByLabelText } = await renderPicker({ onSelect: jest.fn(), onPreview });
  fireEvent.press(getByLabelText("Preview Push Up"));
  expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
});

test("pressing the info button never triggers onSelect (no accidental add)", async () => {
  const onSelect = jest.fn();
  const onPreview = jest.fn();
  const { getByLabelText } = await renderPicker({ onSelect, onPreview });
  fireEvent.press(getByLabelText("Preview Push Up"));
  expect(onPreview).toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

test("row tap still calls onSelect when onPreview is supplied", async () => {
  const onSelect = jest.fn();
  const { getByText } = await renderPicker({ onSelect, onPreview: jest.fn() });
  fireEvent.press(getByText("Push Up"));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "e1" }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/components/__tests__/ExercisePicker.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: FAIL — no element labelled `Preview Barbell curl`.

- [ ] **Step 3: Add the prop and the button**

In `src/components/ExercisePicker.tsx`, extend the props:

```tsx
export default function ExercisePicker({
  onSelect,
  onPreview,
}: {
  onSelect: (exercise: CatalogExercise) => void;
  onPreview?: (exercise: CatalogExercise) => void;
}) {
```

Inside `renderItem`, after the existing name `<Text>`, add:

```tsx
            {onPreview ? (
              <Pressable
                onPress={(e) => {
                  // The row itself adds the exercise in the builder — stop the
                  // press here so previewing never also adds.
                  e.stopPropagation();
                  onPreview(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${item.name}`}
                hitSlop={8}
                style={{ marginLeft: "auto", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
              >
                <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 16 }}>ⓘ</Text>
              </Pressable>
            ) : null}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/components/__tests__/ExercisePicker.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS (4 tests). If the stopPropagation test still fails, the nested `Pressable` is bubbling — verify the handler signature receives the event and that the outer row is a `Pressable` (not a `TouchableOpacity` with different bubbling); report rather than deleting the assertion.

- [ ] **Step 5: Run the full suite**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all pass — existing builder/library tests are unaffected because `onPreview` is optional.

- [ ] **Step 6: Commit**

```bash
git add src/components/ExercisePicker.tsx src/components/__tests__/ExercisePicker.test.tsx
git commit -m "feat: picker info button opens an exercise preview"
```

---

### Task 11: Wire preview into Library and builder

**Files:**
- Modify: `src/app/(app)/library.tsx`
- Modify: `src/app/(app)/builder.tsx:158`
- Modify: `src/app/__tests__/library.test.tsx`

**Interfaces:**
- Consumes: `ExercisePreview` (Task 9), `ExercisePicker`'s `onPreview` (Task 10).
- Produces: no new exports. Final task — the feature is complete after this.

Library's `onSelect` is currently a no-op, so there it opens the preview too (making the whole row useful). The builder keeps tap-to-add untouched and gets preview only via ⓘ.

- [ ] **Step 1: Write the failing test**

Append to `src/app/__tests__/library.test.tsx`. It already mocks `expo-image`, `expo-router`, and `../../lib/catalog` (fixture: `id: "1"`, `"Push Up"`) and imports `render, fireEvent, waitFor` — reuse all of it. Add `gifUrl: null` to that fixture (line 13 area) so it is a valid `CatalogExercise`.

The preview sheet is identified by its close button's accessibility label, which is stable and already asserted in Task 9:

```tsx
test("tapping an exercise row opens its preview", async () => {
  const { getByText, queryByLabelText, findByLabelText } = await render(<Library />);
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  expect(queryByLabelText("Close preview")).toBeNull();
  fireEvent.press(getByText("Push Up"));
  expect(await findByLabelText("Close preview")).toBeTruthy();
});

test("the info button also opens the preview", async () => {
  const { getByText, getByLabelText, findByLabelText } = await render(<Library />);
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
  fireEvent.press(getByLabelText("Preview Push Up"));
  expect(await findByLabelText("Close preview")).toBeTruthy();
});
```

Keep both existing tests (`"lists exercises returned by the catalog"` and `"re-queries the catalog when the search text changes"`) passing unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/app/__tests__/library.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: FAIL — no preview appears.

- [ ] **Step 3: Wire up Library**

Rewrite `src/app/(app)/library.tsx`:

```tsx
import { useState } from "react";
import ExercisePicker from "../../components/ExercisePicker";
import ExercisePreview from "../../components/ExercisePreview";
import { Screen } from "../../components/ui";
import type { CatalogExercise } from "../../lib/catalog";

export default function Library() {
  const [preview, setPreview] = useState<CatalogExercise | null>(null);
  return (
    <Screen scroll>
      {/* Browsing only: a row tap previews rather than selecting. */}
      <ExercisePicker onSelect={setPreview} onPreview={setPreview} />
      <ExercisePreview exercise={preview} onClose={() => setPreview(null)} />
    </Screen>
  );
}
```

- [ ] **Step 4: Wire up the builder**

In `src/app/(app)/builder.tsx`, add the import:

```tsx
import ExercisePreview from "../../components/ExercisePreview";
```

Add state beside the existing `useState` calls:

```tsx
  const [preview, setPreview] = useState<CatalogExercise | null>(null);
```

Replace line 158 (`<ExercisePicker onSelect={add} />`) with:

```tsx
      <ExercisePicker onSelect={add} onPreview={setPreview} />
      <ExercisePreview exercise={preview} onClose={() => setPreview(null)} />
```

Tap-to-add (`add`) is unchanged.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/app/__tests__/library.test.tsx src/app/__tests__/builder.test.tsx --modulePathIgnorePatterns /.claude/`
Expected: PASS. The builder's existing add-on-tap tests must still pass untouched — if one breaks, the ⓘ is intercepting row taps and that is a real bug in Task 10's implementation.

- [ ] **Step 6: Run the full suite and type-check**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -v eyedropper | grep "error TS" | grep -v __tests__ | grep -v __mocks__`
Expected: all tests pass; the tsc check prints no output.

- [ ] **Step 7: Verify the web bundle still builds**

Run: `npx expo export --platform web`
Expected: completes without error (this catches native-only imports leaking into the web build).

- [ ] **Step 8: Commit**

```bash
git add "src/app/(app)/library.tsx" "src/app/(app)/builder.tsx" src/app/__tests__/library.test.tsx
git commit -m "feat: preview exercises from library and builder"
```

---

## Post-implementation (live steps, after the branch merges)

These require credentials and touch production, so they run after merge, not during implementation.

> **Ordering is load-bearing: apply migration 0009 BEFORE the app code reaches users.**
> `src/lib/workouts.ts:78` names `gif_url` explicitly in its nested select, so until the column
> exists PostgREST rejects the whole query and `getWorkout` — and therefore the Player — fails.
> (`listExercises` uses `select("*")`, so Library and the builder degrade gracefully; it is the
> workout/player path that breaks.) If the deploy is already live, apply step 1 immediately: the
> migration is a single additive `add column`, safe to run against a serving database.

1. **Apply migration 0009.** The direct DB host does not resolve in this environment, so use the Management API:
   ```bash
   curl -s -X POST "https://api.supabase.com/v1/projects/ppgjvqoutuxwhvhyaqhj/database/query" \
     -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
     -d '{"query":"alter table exercises add column gif_url text;"}'
   ```
   Empty `[]` means success.
2. **Redeploy the sync function:** `npx supabase functions deploy sync-exercises`.
3. **Re-invoke it** to backfill `gif_url` and the enriched `config` for the 30 standard exercises, then spot-check:
   ```sql
   select count(*) filter (where gif_url is not null) as with_gif, count(*) from exercises;
   ```
4. **Verify in the app:** run a workout and confirm the exercise animates; open a preview from Library and confirm overview, numbered instructions and chips render.
5. **Update the `padel-hiit-app` memory:** navigation shell, `0009` + gif enrichment, preview sheet; note the RapidAPI free-tier 30-exercise cap still applies.
