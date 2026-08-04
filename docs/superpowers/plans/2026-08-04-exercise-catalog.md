# Exercise Catalog + ExerciseDB Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Populate the shared `exercises` table with generic moves synced from ExerciseDB (metadata only, media hotlinked — never re-hosted), and give the app a searchable Library screen where every exercise — ExerciseDB, padel, or reaction — is read through one unified data layer.

**Architecture:** A Supabase **Edge Function** (`sync-exercises`) runs server-side, holds the RapidAPI key as a Supabase secret, pages through the ExerciseDB (AscendAPI) endpoint, and upserts *metadata only* into the `exercises` table as built-in rows (`owner_id = null`), storing ExerciseDB's `imageUrl` verbatim as a hotlink in `media_url`. The client never touches ExerciseDB or the key — it reads the cached `exercises` table through a `src/lib/catalog.ts` layer that normalizes every source to one `CatalogExercise` shape. A `Library` screen renders that list with search and hotlinked images (via `expo-image`, which caches on device).

**Tech Stack:** Supabase Edge Functions (Deno runtime, `Deno.serve`, `@supabase/supabase-js` via esm.sh), Supabase CLI (`functions deploy`, `secrets set`, `db push`), `expo-image` (already installed), Jest + `@testing-library/react-native`, expo-router.

## Global Constraints

- **Media licensing (CRITICAL):** ExerciseDB metadata (name, muscles, equipment, difficulty, image URL) MAY be cached in Postgres. ExerciseDB **media must be hotlinked from its upstream URL — NEVER downloaded, re-hosted, or copied into Supabase Storage.** `media_url` stores the upstream `imageUrl` string unchanged. Only the user's own padel clips are ever stored in Supabase Storage (a later plan).
- **Secret handling:** the RapidAPI key is `RAPIDAPI_KEY`, a **server-side Supabase Edge Function secret** set via `supabase secrets set`. It is NOT an `EXPO_PUBLIC_*` variable and must NEVER appear in client code, the repo, or any bundle. The client reaches ExerciseDB only indirectly, through the cached table.
- **Shared exercise identity:** every exercise — ExerciseDB, padel, reaction — lives in the one `exercises` table with a `type` (`standard` | `reaction`), a `source` (`exercisedb` | `padel` | `custom`), and a JSONB `config`. The catalog layer presents them all as one `CatalogExercise` shape.
- **Idempotent sync:** re-running the sync must update existing rows, never create duplicates. ExerciseDB's `exerciseId` is the stable external key.
- **Built-in visibility:** synced exercises have `owner_id = null` (visible to everyone under the existing `read exercises` RLS policy). Writing null-owner rows bypasses the `write own exercises` RLS policy, so the sync uses the service-role key inside the Edge Function.
- **Platform:** every screen must render on web (mobile + desktop) first.
- `npm install` in this repo must use `--legacy-peer-deps` (react / react-test-renderer peer conflict).
- The pre-existing `eyedropper/` directory is git-ignored and excluded from jest — leave it untouched.

---

## ExerciseDB (AscendAPI) contract — verified 2026-08-04

- **Base URL:** `https://edb-with-gifs-and-images-by-ascendapi.p.rapidapi.com/api/v1/exercises`
- **Auth headers (both required):**
  - `X-RapidAPI-Key: <RAPIDAPI_KEY>`
  - `X-RapidAPI-Host: edb-with-gifs-and-images-by-ascendapi.p.rapidapi.com`
- **Pagination:** cursor-based. Query params: `limit` (min 1, **max 25**, default 10) and `after` (cursor = an exercise id). Loop while `meta.hasNextPage`, passing `after = meta.nextCursor`.
- **Response envelope (`GET /api/v1/exercises`):**

```json
{
  "success": true,
  "meta": { "total": 2000, "hasNextPage": true, "hasPreviousPage": false,
            "nextCursor": "someId", "previousCursor": "" },
  "data": [
    { "exerciseId": "0001", "name": "3/4 sit-up",
      "imageUrl": "https://.../0001.gif",
      "bodyParts": ["waist"], "targetMuscles": ["abs"],
      "secondaryMuscles": ["hip flexors"], "equipments": ["body weight"],
      "exerciseTypes": ["strength"], "difficulty": "beginner" }
  ]
}
```

- ExerciseDB V1 holds ~2000 exercises → ~80 requests per full sync at `limit=25`. The sync runs rarely (manually or on a schedule), not per user, so a free RapidAPI tier's monthly cap is ample. This assumption is recorded in the pre-launch checklist.

---

## File Structure

- `supabase/migrations/0002_exercise_external_id.sql` — adds `external_id` + a unique index enabling idempotent upserts
- `supabase/functions/sync-exercises/map.ts` — pure, Deno-free mapper: one ExerciseDB API object → one `exercises` row (metadata only, media hotlinked). Importable by both Deno and jest.
- `supabase/functions/sync-exercises/index.ts` — the Edge Function: pages the API, upserts via service role
- `supabase/functions/sync-exercises/__tests__/map.test.ts` — tests the mapper (the licensing-critical logic)
- `src/lib/catalog.ts` — `CatalogExercise` type + `listExercises()` unified read layer
- `src/lib/__tests__/catalog.test.ts` — tests the data layer against a mocked supabase client
- `src/app/(app)/library.tsx` — searchable Library screen
- `src/app/__tests__/library.test.tsx` — tests the screen against a mocked catalog
- `src/app/(app)/index.tsx` — modify: add a link to the Library

---

### Task 1: Migration — external_id for idempotent ExerciseDB upserts

**Files:**
- Create: `supabase/migrations/0002_exercise_external_id.sql`
- Test: `supabase/migrations/__tests__/schema-0002.test.ts`

**Interfaces:**
- Consumes: the `exercises` table from `0001_init.sql`
- Produces: an `external_id text` column on `exercises` and a unique index on `(source, external_id)`, so `upsert(..., { onConflict: "source,external_id" })` is idempotent. `external_id` is null for padel/custom rows; Postgres treats nulls as distinct in unique indexes, so many null rows coexist without conflict.

- [ ] **Step 1: Write the failing test**

`supabase/migrations/__tests__/schema-0002.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(join(__dirname, "..", "0002_exercise_external_id.sql"), "utf8").toLowerCase();

test("adds external_id column to exercises", () => {
  expect(sql).toContain("alter table exercises");
  expect(sql).toContain("external_id");
});

test("adds a unique index on (source, external_id) for idempotent upserts", () => {
  expect(sql).toContain("unique");
  expect(sql).toContain("source, external_id");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- schema-0002`
Expected: FAIL — file `0002_exercise_external_id.sql` not found.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0002_exercise_external_id.sql`:

```sql
-- External id ties a cached ExerciseDB row to its upstream exerciseId, so
-- re-syncing updates in place instead of duplicating. Null for padel/custom.
alter table exercises add column external_id text;

-- Unique per source. Padel/custom rows have external_id null; Postgres treats
-- nulls as distinct, so many null-external_id rows coexist without conflict.
-- This index is the arbiter for upsert(..., { onConflict: 'source,external_id' }).
create unique index exercises_source_external_id_key
  on exercises (source, external_id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- schema-0002`
Expected: PASS.

- [ ] **Step 5: Apply the migration to the Supabase project**

```bash
npx supabase db push
```

Expected: `0002` applies with no errors. Verify in the dashboard (Table Editor → `exercises`) that the `external_id` column exists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add exercises.external_id + unique index for idempotent sync"
```

---

### Task 2: ExerciseDB sync Edge Function (metadata only, media hotlinked)

**Files:**
- Create: `supabase/functions/sync-exercises/map.ts`
- Create: `supabase/functions/sync-exercises/index.ts`
- Test: `supabase/functions/sync-exercises/__tests__/map.test.ts`

**Interfaces:**
- Consumes: the ExerciseDB response contract above; `RAPIDAPI_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from the Edge Function environment; the `exercises` table + `external_id` unique index from Task 1.
- Produces:
  - `mapExerciseToRow(e: ApiExercise): ExerciseRow` — pure function, no Deno/network. `ExerciseRow = { name: string; type: "standard"; source: "exercisedb"; media_url: string; external_id: string; owner_id: null; config: { body_parts: string[]; target_muscles: string[]; secondary_muscles: string[]; equipments: string[]; difficulty: string } }`. `media_url` is `e.imageUrl` **verbatim** (a hotlink — never a re-hosted copy).
  - An HTTP-triggered Edge Function that pages the API and upserts all rows with `{ onConflict: "source,external_id" }`, returning `{ synced: <count> }`.

- [ ] **Step 1: Scaffold the function directory**

```bash
npx supabase functions new sync-exercises
```

Expected: creates `supabase/functions/sync-exercises/index.ts` (a stub). You will overwrite it in Step 5.

- [ ] **Step 2: Write the failing test for the mapper**

`supabase/functions/sync-exercises/__tests__/map.test.ts`:

```ts
import { mapExerciseToRow, ApiExercise } from "../map";

const sample: ApiExercise = {
  exerciseId: "0001",
  name: "3/4 sit-up",
  imageUrl: "https://cdn.example.com/exercises/0001.gif",
  bodyParts: ["waist"],
  targetMuscles: ["abs"],
  secondaryMuscles: ["hip flexors"],
  equipments: ["body weight"],
  exerciseTypes: ["strength"],
  difficulty: "beginner",
};

test("maps an ExerciseDB object to a built-in standard exercise row", () => {
  const row = mapExerciseToRow(sample);
  expect(row.name).toBe("3/4 sit-up");
  expect(row.type).toBe("standard");
  expect(row.source).toBe("exercisedb");
  expect(row.external_id).toBe("0001");
  expect(row.owner_id).toBeNull();
});

test("hotlinks the upstream image verbatim — never re-hosts media", () => {
  const row = mapExerciseToRow(sample);
  // media_url MUST be the upstream URL, byte-for-byte. Any transform here
  // (download, re-upload, path rewrite) would violate the licensing constraint.
  expect(row.media_url).toBe("https://cdn.example.com/exercises/0001.gif");
});

test("caches facet metadata in config", () => {
  const row = mapExerciseToRow(sample);
  expect(row.config).toEqual({
    body_parts: ["waist"],
    target_muscles: ["abs"],
    secondary_muscles: ["hip flexors"],
    equipments: ["body weight"],
    difficulty: "beginner",
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- map`
Expected: FAIL — cannot find module `../map`.

- [ ] **Step 4: Write the mapper**

`supabase/functions/sync-exercises/map.ts` (no Deno or network imports — runs under both Deno and jest):

```ts
export type ApiExercise = {
  exerciseId: string;
  name: string;
  imageUrl: string;
  bodyParts: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  equipments: string[];
  exerciseTypes: string[];
  difficulty: string;
};

export type ExerciseRow = {
  name: string;
  type: "standard";
  source: "exercisedb";
  media_url: string; // upstream hotlink — NEVER a re-hosted copy
  external_id: string;
  owner_id: null;
  config: {
    body_parts: string[];
    target_muscles: string[];
    secondary_muscles: string[];
    equipments: string[];
    difficulty: string;
  };
};

export function mapExerciseToRow(e: ApiExercise): ExerciseRow {
  return {
    name: e.name,
    type: "standard",
    source: "exercisedb",
    media_url: e.imageUrl, // hotlink, unchanged
    external_id: e.exerciseId,
    owner_id: null,
    config: {
      body_parts: e.bodyParts ?? [],
      target_muscles: e.targetMuscles ?? [],
      secondary_muscles: e.secondaryMuscles ?? [],
      equipments: e.equipments ?? [],
      difficulty: e.difficulty ?? "",
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- map`
Expected: PASS.

- [ ] **Step 6: Write the Edge Function**

`supabase/functions/sync-exercises/index.ts`:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapExerciseToRow, ApiExercise } from "./map.ts";

const API_HOST = "edb-with-gifs-and-images-by-ascendapi.p.rapidapi.com";
const API_BASE = `https://${API_HOST}/api/v1/exercises`;

Deno.serve(async () => {
  const rapidKey = Deno.env.get("RAPIDAPI_KEY");
  if (!rapidKey) {
    return new Response("Missing RAPIDAPI_KEY", { status: 500 });
  }

  // Service role: bypasses RLS so we can write built-in rows (owner_id null).
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let after: string | undefined;
  let synced = 0;

  do {
    const url = new URL(API_BASE);
    url.searchParams.set("limit", "25"); // API max
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url, {
      headers: { "X-RapidAPI-Key": rapidKey, "X-RapidAPI-Host": API_HOST },
    });
    if (!res.ok) {
      return new Response(`Upstream error ${res.status}`, { status: 502 });
    }

    const body = await res.json();
    const rows = (body.data as ApiExercise[]).map(mapExerciseToRow);

    const { error } = await supabase
      .from("exercises")
      .upsert(rows, { onConflict: "source,external_id" });
    if (error) {
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }

    synced += rows.length;
    after = body.meta?.hasNextPage ? body.meta.nextCursor : undefined;
  } while (after);

  return new Response(JSON.stringify({ synced }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 7: Get a RapidAPI key and store it as a Supabase secret (live)**

1. Create a free account at rapidapi.com, subscribe to the free tier of **"ExerciseDB (edb-with-gifs-and-images by AscendAPI)"**, and copy the `X-RapidAPI-Key`.
2. Store it as an Edge Function secret (NOT in `.env`, NOT `EXPO_PUBLIC_`):

```bash
npx supabase secrets set RAPIDAPI_KEY=<your-rapidapi-key>
```

- [ ] **Step 8: Deploy and run the sync (live)**

```bash
npx supabase functions deploy sync-exercises
npx supabase functions invoke sync-exercises --no-verify-jwt
```

Expected: the invoke returns `{ "synced": <n> }` with `n` in the low thousands. Verify in the dashboard (Table Editor → `exercises`) that rows exist with `source = 'exercisedb'`, `owner_id` null, and `media_url` pointing at the upstream ExerciseDB CDN. Re-invoking must keep the row count stable (idempotent), not double it.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add sync-exercises Edge Function caching ExerciseDB metadata"
```

---

### Task 3: Unified catalog data layer

**Files:**
- Create: `src/lib/catalog.ts`
- Test: `src/lib/__tests__/catalog.test.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`
- Produces:
  - `type CatalogExercise = { id: string; name: string; type: "standard" | "reaction"; source: "exercisedb" | "padel" | "custom"; mediaUrl: string | null; config: Record<string, unknown> }`
  - `listExercises(opts?: { search?: string }): Promise<CatalogExercise[]>` — selects from `exercises` ordered by name, applies a case-insensitive name filter when `search` is set, and normalizes DB rows (`media_url` → `mediaUrl`) to `CatalogExercise`. Throws on query error.

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/catalog.test.ts`:

```ts
jest.mock("../supabase", () => {
  const rows = [
    {
      id: "1",
      name: "Push Up",
      type: "standard",
      source: "exercisedb",
      media_url: "https://cdn.example.com/pushup.gif",
      config: { body_parts: ["chest"] },
    },
  ];
  const builder: any = {};
  builder.select = jest.fn(() => builder);
  builder.order = jest.fn(() => builder);
  builder.ilike = jest.fn(() => builder);
  builder.then = (resolve: any) => resolve({ data: rows, error: null });
  return { supabase: { from: jest.fn(() => builder), __builder: builder } };
});

import { listExercises } from "../catalog";
import { supabase } from "../supabase";

test("normalizes exercises rows into CatalogExercise shape", async () => {
  const items = await listExercises();
  expect(items).toEqual([
    {
      id: "1",
      name: "Push Up",
      type: "standard",
      source: "exercisedb",
      mediaUrl: "https://cdn.example.com/pushup.gif",
      config: { body_parts: ["chest"] },
    },
  ]);
  expect((supabase as any).from).toHaveBeenCalledWith("exercises");
});

test("applies a case-insensitive name filter when search is given", async () => {
  await listExercises({ search: "push" });
  expect((supabase as any).__builder.ilike).toHaveBeenCalledWith("name", "%push%");
});

test("does not filter when no search is given", async () => {
  (supabase as any).__builder.ilike.mockClear();
  await listExercises();
  expect((supabase as any).__builder.ilike).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- catalog`
Expected: FAIL — cannot find module `../catalog`.

- [ ] **Step 3: Implement the catalog layer**

`src/lib/catalog.ts`:

```ts
import { supabase } from "./supabase";

export type CatalogExercise = {
  id: string;
  name: string;
  type: "standard" | "reaction";
  source: "exercisedb" | "padel" | "custom";
  mediaUrl: string | null;
  config: Record<string, unknown>;
};

export async function listExercises(
  opts: { search?: string } = {},
): Promise<CatalogExercise[]> {
  let query = supabase.from("exercises").select("*").order("name");
  if (opts.search) {
    query = query.ilike("name", `%${opts.search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    source: r.source,
    mediaUrl: r.media_url ?? null,
    config: r.config ?? {},
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- catalog`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add unified exercise catalog data layer"
```

---

### Task 4: Library screen with search and hotlinked images

**Files:**
- Create: `src/app/(app)/library.tsx`
- Modify: `src/app/(app)/index.tsx` (add a link to the Library)
- Test: `src/app/__tests__/library.test.tsx`

**Interfaces:**
- Consumes: `listExercises`, `CatalogExercise` from `src/lib/catalog`; `Image` from `expo-image`; `Link` from `expo-router`
- Produces: a default-exported `Library` screen — a search box plus a `FlatList` of exercises, each row showing the hotlinked image (when `mediaUrl` is set) and the name. Re-queries `listExercises({ search })` whenever the search text changes.

- [ ] **Step 1: Write the failing test**

`src/app/__tests__/library.test.tsx`:

```tsx
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import React from "react";

jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-router", () => ({ Link: ({ children }: any) => children }));

const listExercises = jest.fn().mockResolvedValue([
  {
    id: "1",
    name: "Push Up",
    type: "standard",
    source: "exercisedb",
    mediaUrl: "https://cdn.example.com/pushup.gif",
    config: {},
  },
]);
jest.mock("../../lib/catalog", () => ({ listExercises: (...a: any[]) => listExercises(...a) }));

import Library from "../(app)/library";

test("lists exercises returned by the catalog", async () => {
  const { getByText } = await render(<Library />);
  await waitFor(() => expect(getByText("Push Up")).toBeTruthy());
});

test("re-queries the catalog when the search text changes", async () => {
  const { getByPlaceholderText } = await render(<Library />);
  fireEvent.changeText(getByPlaceholderText("Search exercises"), "squat");
  await waitFor(() =>
    expect(listExercises).toHaveBeenCalledWith({ search: "squat" }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- library`
Expected: FAIL — cannot find module `../(app)/library`.

- [ ] **Step 3: Implement the Library screen**

`src/app/(app)/library.tsx`:

```tsx
import { useEffect, useState } from "react";
import { View, Text, TextInput, FlatList } from "react-native";
import { Image } from "expo-image";
import { listExercises, type CatalogExercise } from "../../lib/catalog";

export default function Library() {
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CatalogExercise[]>([]);

  useEffect(() => {
    let active = true;
    listExercises({ search })
      .then((r) => {
        if (active) setItems(r);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, [search]);

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <TextInput
        placeholder="Search exercises"
        autoCapitalize="none"
        value={search}
        onChangeText={setSearch}
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              paddingVertical: 8,
            }}
          >
            {item.mediaUrl ? (
              <Image
                source={{ uri: item.mediaUrl }}
                style={{ width: 64, height: 64, borderRadius: 8 }}
                contentFit="cover"
              />
            ) : null}
            <Text style={{ fontSize: 16 }}>{item.name}</Text>
          </View>
        )}
      />
    </View>
  );
}
```

Note: `listExercises({ search })` is called with `search = ""` on first render, which the catalog layer treats as "no filter" (empty string is falsy). The test asserts the `{ search: "squat" }` call after a change, so this matches.

- [ ] **Step 4: Add a link to the Library from home**

Modify `src/app/(app)/index.tsx` — add a `Link` to `/library`. Current file:

```tsx
import { View, Text, Pressable } from "react-native";
import { useAuth } from "../../lib/auth-context";

export default function Home() {
  const { signOut, session } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
      <Text style={{ fontSize: 20 }}>Logged in as {session?.user.email}</Text>
      <Pressable onPress={signOut} style={{ padding: 12 }}>
        <Text>Log out</Text>
      </Pressable>
    </View>
  );
}
```

Add the import and the link (keep everything else unchanged):

```tsx
import { View, Text, Pressable } from "react-native";
import { Link } from "expo-router";
import { useAuth } from "../../lib/auth-context";

export default function Home() {
  const { signOut, session } = useAuth();
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 12 }}>
      <Text style={{ fontSize: 20 }}>Logged in as {session?.user.email}</Text>
      <Link href="/library" style={{ fontSize: 16, color: "#2563eb" }}>
        Browse exercises
      </Link>
      <Pressable onPress={signOut} style={{ padding: 12 }}>
        <Text>Log out</Text>
      </Pressable>
    </View>
  );
}
```

Note: confirm the existing import path for `useAuth` (`../../lib/auth-context`) against the file before editing — match it exactly rather than assuming.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- library`
Expected: PASS (both tests).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites pass (Foundation's plus the four added here).

- [ ] **Step 7: Manual end-to-end check on web (live — requires Task 2 sync to have run)**

Run: `npx expo start --web`
Expected: log in → tap "Browse exercises" → the Library lists ExerciseDB moves with images loading from the upstream CDN. Typing in the search box narrows the list by name. (If `expo start --web` is unavailable in the environment, substitute `npx expo export --platform web` and confirm a clean bundle, as in Foundation.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add searchable exercise Library screen"
```

---

## Self-Review

**Spec coverage (Exercise catalog slice, spec §8 + §5):**
- Browse/search generic moves from cached ExerciseDB metadata, media hotlinked → Tasks 2 (sync), 3 (data layer), 4 (screen). ✓
- Unified shape across exercisedb/padel/reaction → `CatalogExercise` in Task 3; reads the one shared table, so padel/reaction rows (added by later plans) surface with no catalog change. ✓
- Metadata cached, media hotlinked, never re-hosted → enforced in the mapper (Task 2) and asserted by a dedicated test; `media_url` is `imageUrl` verbatim. ✓
- Key hidden server-side via the one Edge Function → Task 2; `RAPIDAPI_KEY` is a Supabase secret, never `EXPO_PUBLIC_`, never in the client. ✓
- Idempotent re-sync → Task 1's `external_id` + unique index; Task 2 upserts `onConflict: "source,external_id"`; Task 8 verifies row count is stable on re-invoke. ✓
- Out of scope by design and correctly absent: padel upload path (own plan), workout builder/engine, Player/reaction driver, history. ✓

**Placeholder scan:** No TBD/TODO. `<your-rapidapi-key>` and `RAPIDAPI_KEY` values are genuine per-user secrets the engineer supplies, not plan placeholders. All code and test steps carry concrete content. ✓

**Type consistency:** `ExerciseRow`/`ApiExercise` field names match between `map.ts`, its test, and the Edge Function's `upsert`. `CatalogExercise` (`id`, `name`, `type`, `source`, `mediaUrl`, `config`) is identical across Task 3's impl, its test, and Task 4's consumer. `media_url` (DB/snake) → `mediaUrl` (catalog/camel) mapping is consistent. `onConflict: "source,external_id"` matches the unique index created in Task 1. ✓

**Assumptions to confirm with the reviewer/user:**
- ExerciseDB is now the keyed AscendAPI-on-RapidAPI product (verified 2026-08-04); the free tier is assumed sufficient for infrequent full syncs (~80 requests each). Recorded in the pre-launch checklist.
- The Library is reached via a plain `Link` from home (no tab bar yet); a proper navigation shell is deferred to a later UI pass.
