# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo + Supabase foundation — a cross-platform app that runs on web, lets a user sign up / log in / log out with sessions that persist, and has the full database schema in place.

**Architecture:** One Expo (React Native + React Native Web) codebase talks to a Supabase backend (Postgres + Auth). Auth state lives in a React context backed by the Supabase client, whose session is persisted with encrypted SecureStore on native and localStorage on web. The database schema is defined as SQL migrations checked into the repo. Route groups gate the app: unauthenticated users see auth screens, authenticated users see the (empty for now) app shell.

**Tech Stack:** Expo SDK 57 (expo-router, TypeScript), `@supabase/supabase-js`, `@react-native-async-storage/async-storage`, `expo-secure-store`, `aes-js`, `react-native-get-random-values`, Jest + `@testing-library/react-native`, Supabase CLI for local migrations.

## Global Constraints

- Platform targets: web (mobile + desktop browsers) first; iOS/Android from the same codebase later. Every screen must render on web.
- Backend: Supabase only (Auth, Postgres, Storage, Edge Functions). No other backend service.
- Secrets (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) come from env vars, never hardcoded. `.env` is gitignored.
- Media licensing (future tasks): ExerciseDB metadata may be cached; ExerciseDB media must be hotlinked, never re-hosted. Only user-owned padel clips are stored in Supabase Storage. (Not exercised in this plan, but the schema must not assume re-hosted ExerciseDB media.)
- Exercise identity: every exercise — standard, padel, or reaction — shares one `exercises` table with a `type` and a JSONB `config`.
- History is immutable: a completed run stores a full `settings_snapshot`, never a live reference.

---

## File Structure

- `app/_layout.tsx` — root layout; wraps app in `AuthProvider`, redirects based on session
- `app/(auth)/login.tsx` — login + sign-up screen
- `app/(app)/index.tsx` — placeholder home screen (authenticated), has logout button
- `src/lib/supabase.ts` — Supabase client with platform-aware persisted storage
- `src/lib/auth-context.tsx` — `AuthProvider` + `useAuth()` hook
- `supabase/migrations/0001_init.sql` — full v1 schema + row-level security
- `.env` (gitignored) / `.env.example` (committed) — Supabase URL + anon key
- Tests colocated under `src/**/__tests__/` and `app/**/__tests__/`

---

### Task 1: Scaffold the Expo app and get it running on web

**Files:**
- Create: whole Expo default project in repo root (`app/`, `package.json`, `tsconfig.json`, `app.json`)
- Modify: `.gitignore` (ensure `node_modules/`, `.expo/`, `dist/`, `.env`, `.env.local`)

**Interfaces:**
- Consumes: nothing
- Produces: a runnable Expo project with expo-router + TypeScript; `npm test` wired up

- [ ] **Step 1: Create the project into the current repo**

The repo already contains `docs/` and `.git`. Scaffold into a temp dir and move files in to avoid clobbering.

```bash
npx create-expo-app@latest padel-app --template default@sdk-57
# move contents (including dotfiles) up into repo root, then remove the temp dir
cp -R padel-app/. .
rm -rf padel-app
```

- [ ] **Step 2: Verify web runs**

Run: `npx expo start --web`
Expected: the default Expo starter app opens in a browser with no errors. Stop the server after confirming.

- [ ] **Step 3: Add Jest + testing-library**

```bash
npx expo install jest-expo jest @testing-library/react-native @testing-library/jest-native --dev
```

Add to `package.json`:

```json
{
  "scripts": { "test": "jest" },
  "jest": { "preset": "jest-expo" }
}
```

- [ ] **Step 4: Write a smoke test**

Create `src/lib/__tests__/smoke.test.ts`:

```ts
test("test harness runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 5: Run the test**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Expo app with expo-router, TypeScript, and Jest"
```

---

### Task 2: Supabase client with platform-aware persisted sessions

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `.env.example`
- Modify: `.env` (local only, gitignored)
- Test: `src/lib/__tests__/supabase.test.ts`

**Interfaces:**
- Consumes: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` from env
- Produces: `export const supabase` — a configured `SupabaseClient` with `persistSession: true`, `autoRefreshToken: true`, `detectSessionInUrl: false`, and platform-appropriate storage

- [ ] **Step 1: Install dependencies**

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage expo-secure-store
npm install aes-js react-native-get-random-values
npm install --save-dev @types/aes-js
```

- [ ] **Step 2: Add env files**

`.env.example` (committed):

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Create a local `.env` with real values from the Supabase project dashboard (Settings → API). Confirm `.env` is gitignored.

- [ ] **Step 3: Write the failing test**

`src/lib/__tests__/supabase.test.ts`:

```ts
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

test("exports a supabase client with auth configured", () => {
  const { supabase } = require("../supabase");
  expect(supabase).toBeDefined();
  expect(typeof supabase.auth.getSession).toBe("function");
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- supabase`
Expected: FAIL — cannot find module `../supabase`.

- [ ] **Step 5: Implement the client**

`src/lib/supabase.ts`. On web, use default storage (localStorage) by passing no custom storage; on native, use a `LargeSecureStore` (AES-256 key in SecureStore, ciphertext in AsyncStorage) because SecureStore caps values at 2048 bytes.

```ts
import "react-native-get-random-values";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as aesjs from "aes-js";
import { createClient } from "@supabase/supabase-js";

class LargeSecureStore {
  private async _encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }
  private async _decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1)
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }
  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return null;
    return this._decrypt(key, encrypted);
  }
  async setItem(key: string, value: string) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
  async removeItem(key: string) {
    await SecureStore.deleteItemAsync(key);
    await AsyncStorage.removeItem(key);
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey, {
  auth: {
    ...(Platform.OS !== "web" ? { storage: new LargeSecureStore() } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- supabase`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add platform-aware Supabase client with persisted sessions"
```

---

### Task 3: Database schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`
- Test: `supabase/migrations/__tests__/schema.test.ts` (asserts the SQL contains the required objects)

**Interfaces:**
- Consumes: nothing
- Produces: tables `profiles`, `exercises`, `workouts`, `workout_blocks`, `workout_history`, each with RLS enabled; a trigger creating a `profiles` row on new-user signup

- [ ] **Step 1: Install the Supabase CLI (once)**

```bash
npx supabase --version    # or: brew install supabase/tap/supabase
npx supabase init         # creates supabase/ if not present
```

- [ ] **Step 2: Write the failing test**

`supabase/migrations/__tests__/schema.test.ts`:

```ts
import { readFileSync } from "fs";
import { join } from "path";

const sql = readFileSync(join(__dirname, "..", "0001_init.sql"), "utf8");

test.each([
  "create table profiles",
  "create table exercises",
  "create table workouts",
  "create table workout_blocks",
  "create table workout_history",
])("defines %s", (fragment) => {
  expect(sql.toLowerCase()).toContain(fragment);
});

test("enables row level security on user tables", () => {
  expect(sql.toLowerCase()).toContain("enable row level security");
});

test("stores history as an immutable snapshot", () => {
  expect(sql.toLowerCase()).toContain("settings_snapshot");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- schema`
Expected: FAIL — file `0001_init.sql` not found.

- [ ] **Step 4: Write the migration**

`supabase/migrations/0001_init.sql`:

```sql
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
  exercise_id uuid not null references exercises(id),
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- schema`
Expected: PASS.

- [ ] **Step 6: Apply the migration to the Supabase project**

Link and push to the hosted project (project ref from the dashboard URL):

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Expected: migration applies with no errors. Verify the five tables exist in the Supabase dashboard (Table Editor).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add v1 database schema with RLS and profile trigger"
```

---

### Task 4: Auth context and hook

**Files:**
- Create: `src/lib/auth-context.tsx`
- Test: `src/lib/__tests__/auth-context.test.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`
- Produces:
  - `AuthProvider: React.FC<{ children: React.ReactNode }>`
  - `useAuth(): { session: Session | null; loading: boolean; signUp(email, password): Promise<{error: Error|null}>; signIn(email, password): Promise<{error: Error|null}>; signOut(): Promise<void> }`

- [ ] **Step 1: Write the failing test**

`src/lib/__tests__/auth-context.test.tsx`. Mock `supabase` so no network happens.

```tsx
import { render, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import React from "react";

jest.mock("../supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: jest.fn().mockReturnValue({
        data: { subscription: { unsubscribe: jest.fn() } },
      }),
      signInWithPassword: jest.fn(),
      signUp: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

import { AuthProvider, useAuth } from "../auth-context";

function Probe() {
  const { loading, session } = useAuth();
  return <Text>{loading ? "loading" : session ? "in" : "out"}</Text>;
}

test("resolves to logged-out state when there is no session", async () => {
  const { getByText } = render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
  await waitFor(() => expect(getByText("out")).toBeTruthy());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth-context`
Expected: FAIL — cannot find module `../auth-context`.

- [ ] **Step 3: Implement the context**

`src/lib/auth-context.tsx`:

```tsx
import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthValue = {
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthValue = {
    session,
    loading,
    signUp: async (email, password) => {
      const { error } = await supabase.auth.signUp({ email, password });
      return { error };
    },
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error };
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- auth-context`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add auth context with sign up / in / out and session tracking"
```

---

### Task 5: Route gating — auth screens vs. app shell

**Files:**
- Modify/Create: `app/_layout.tsx`
- Create: `app/(auth)/login.tsx`
- Create: `app/(app)/index.tsx`
- Test: `app/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `AuthProvider`, `useAuth` from `src/lib/auth-context`
- Produces: root layout that renders auth stack when `session` is null and app stack when set; a working login/sign-up screen; an authenticated home placeholder with a logout button

- [ ] **Step 1: Write the failing test**

`app/__tests__/login.test.tsx`. Verify the login screen renders and calls `signIn`.

```tsx
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import React from "react";

const signIn = jest.fn().mockResolvedValue({ error: null });
jest.mock("../../src/lib/auth-context", () => ({
  useAuth: () => ({ signIn, signUp: jest.fn(), loading: false, session: null }),
}));

import LoginScreen from "../(auth)/login";

test("submits credentials to signIn", async () => {
  const { getByPlaceholderText, getByText } = render(<LoginScreen />);
  fireEvent.changeText(getByPlaceholderText("Email"), "a@b.com");
  fireEvent.changeText(getByPlaceholderText("Password"), "secret123");
  fireEvent.press(getByText("Log in"));
  await waitFor(() => expect(signIn).toHaveBeenCalledWith("a@b.com", "secret123"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- login`
Expected: FAIL — cannot find module `../(auth)/login`.

- [ ] **Step 3: Implement the login screen**

`app/(auth)/login.tsx`:

```tsx
import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useAuth } from "../../src/lib/auth-context";

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = async (fn: (e: string, p: string) => Promise<{ error: Error | null }>) => {
    const { error } = await fn(email, password);
    setError(error ? error.message : null);
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", padding: 24, gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "600" }}>Padel HIIT</Text>
      <TextInput placeholder="Email" autoCapitalize="none" value={email}
        onChangeText={setEmail} style={{ borderWidth: 1, padding: 12, borderRadius: 8 }} />
      <TextInput placeholder="Password" secureTextEntry value={password}
        onChangeText={setPassword} style={{ borderWidth: 1, padding: 12, borderRadius: 8 }} />
      {error ? <Text style={{ color: "red" }}>{error}</Text> : null}
      <Pressable onPress={() => submit(signIn)} style={{ backgroundColor: "#222", padding: 14, borderRadius: 8 }}>
        <Text style={{ color: "white", textAlign: "center" }}>Log in</Text>
      </Pressable>
      <Pressable onPress={() => submit(signUp)} style={{ padding: 14 }}>
        <Text style={{ textAlign: "center" }}>Create account</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Implement the home placeholder**

`app/(app)/index.tsx`:

```tsx
import { View, Text, Pressable } from "react-native";
import { useAuth } from "../../src/lib/auth-context";

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

- [ ] **Step 5: Implement the gating root layout**

`app/_layout.tsx`:

```tsx
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "../src/lib/auth-context";

function Gate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    if (!session && !inAuthGroup) router.replace("/(auth)/login");
    else if (session && inAuthGroup) router.replace("/(app)");
  }, [session, loading, segments]);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- login`
Expected: PASS.

- [ ] **Step 7: Manual end-to-end check on web**

Run: `npx expo start --web`
Expected: unauthenticated → login screen. Create an account, confirm it lands on the home placeholder showing the email. Reload the page → session persists (still logged in). Log out → back to login screen.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: gate routes by auth state with login and home screens"
```

---

## Self-Review

**Spec coverage (Foundation slice only):**
- Expo one-codebase, web-first → Tasks 1, 5 (web run + manual check). ✓
- Supabase auth + accounts + cross-device sessions → Tasks 2, 4, 5. ✓
- Full v1 schema, shared `exercises` table with `type`+`config`, immutable history snapshot, reaction pool in config → Task 3. ✓
- Media licensing constraint (no re-hosted ExerciseDB media) → schema keeps `media_url` as a plain URL usable for hotlinks; no re-host assumption. ✓ (Edge Function itself is a later plan.)
- Out of scope by design and correctly absent here: exercise catalog UI, workout builder/engine, Player/reaction driver, history UI, padel upload — each its own later plan. ✓

**Placeholder scan:** No TBD/TODO; every code and test step has concrete content. `YOUR_PROJECT_REF` / `YOUR-PROJECT` are genuine per-user secrets the engineer supplies, not plan placeholders. ✓

**Type consistency:** `useAuth()` shape (`session`, `loading`, `signUp`, `signIn`, `signOut`) is identical across Tasks 4 and 5. Table/column names in the schema test match the migration. ✓
