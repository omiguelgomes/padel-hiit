# Reaction Direction Cues Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On each reaction call-out, the player picks a random direction (left/center/right), speaks it, and flashes an in-app court graphic (tennis ball positioned by direction, net below) for ~1 second.

**Architecture:** Pure `pickDirection` helper in `reaction.ts`; a presentational `CourtFlash` component drawn with plain RN Views; player wires them into the existing reaction driver — pick direction, speak it, show a short-lived flash that replaces the countdown timer, then clears via a timeout.

**Tech Stack:** Expo SDK 57 (React Native + RN Web), expo-router, TypeScript, Jest + @testing-library/react-native.

## Global Constraints

- **No new dependencies.** Court/ball/net are plain React Native `View`s styled from `src/theme.ts`. No SVG, no animation library, no media.
- **No DB, storage, or upload changes.** Direction is chosen at play time, never stored or authored. `media_url` / `audio_url` pool fields stay unused for reaction shots.
- **Direction values are exactly** `"left" | "center" | "right"`.
- **On a call-out, speak the direction only** (`"left"` / `"center"` / `"right"`) — this replaces speaking the shot name on call-outs. The shot name stays shown on screen.
- **Injected-RNG style:** pure helpers take `rnd: () => number = Math.random` as the last param, matching existing `pickMove` / `nextDelayMs`.
- **Test command (from repo root):** `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`. **Inside a `.claude/worktrees/` worktree, instead run `rtk proxy npx jest` with NO ignore-pattern flags** (the worktree path contains `.claude/`, so those flags exclude everything).
- Match existing code style: 2-space indent, inline styles keyed off theme tokens, functional components.

---

### Task 1: `pickDirection` helper

**Files:**
- Modify: `src/lib/reaction.ts`
- Test: `src/lib/__tests__/reaction.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `export type ReactionDirection = "left" | "center" | "right"` and `export function pickDirection(rnd?: () => number): ReactionDirection`. Task 2 and Task 3 import both.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/reaction.test.ts`:

```ts
import { readPool, pickMove, nextDelayMs, pickDirection } from "../reaction";

describe("pickDirection", () => {
  test("maps injected randomness across the three directions", () => {
    expect(pickDirection(() => 0)).toBe("left");
    expect(pickDirection(() => 0.5)).toBe("center");
    expect(pickDirection(() => 0.99)).toBe("right");
  });
  test("defaults to Math.random and returns a valid direction", () => {
    expect(["left", "center", "right"]).toContain(pickDirection());
  });
});
```

Note: replace the existing top import line `import { readPool, pickMove, nextDelayMs } from "../reaction";` with the one above (adds `pickDirection`), rather than adding a second import line.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/ src/lib/__tests__/reaction.test.ts`
Expected: FAIL — `pickDirection` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/reaction.ts`:

```ts
export type ReactionDirection = "left" | "center" | "right";

// A random shot target for a reaction call-out. Randomness is injected so the
// Player's cue is deterministic under test, matching pickMove / nextDelayMs.
export function pickDirection(
  rnd: () => number = Math.random,
): ReactionDirection {
  const dirs: ReactionDirection[] = ["left", "center", "right"];
  return dirs[Math.floor(rnd() * dirs.length)];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/ src/lib/__tests__/reaction.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/reaction.ts src/lib/__tests__/reaction.test.ts
git commit -m "feat: pickDirection helper for reaction cues"
```

---

### Task 2: `CourtFlash` component

**Files:**
- Create: `src/components/CourtFlash.tsx`
- Test: `src/components/__tests__/CourtFlash.test.tsx`

**Interfaces:**
- Consumes: `ReactionDirection` from `../lib/reaction` (Task 1); tokens from `../theme`.
- Produces: `export default function CourtFlash({ direction }: { direction: ReactionDirection })`. Task 3 renders it.

- [ ] **Step 1: Write the failing test**

Create `src/components/__tests__/CourtFlash.test.tsx`:

```tsx
import { render } from "@testing-library/react-native";
import React from "react";
import CourtFlash from "../CourtFlash";

test("renders the court, net, and a ball for each direction", () => {
  for (const dir of ["left", "center", "right"] as const) {
    const { getByTestId, unmount } = render(<CourtFlash direction={dir} />);
    expect(getByTestId("court-net")).toBeTruthy();
    expect(getByTestId(`court-ball-${dir}`)).toBeTruthy();
    unmount();
  }
});

test("positions the ball differently per direction", () => {
  const { getByTestId: left } = render(<CourtFlash direction="left" />);
  const leftStyle = left("court-ball-left").props.style;
  const { getByTestId: right } = render(<CourtFlash direction="right" />);
  const rightStyle = right("court-ball-right").props.style;
  // alignment differs between left and right
  expect(JSON.stringify(leftStyle)).not.toEqual(JSON.stringify(rightStyle));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/ src/components/__tests__/CourtFlash.test.tsx`
Expected: FAIL — module `../CourtFlash` not found.

- [ ] **Step 3: Implement**

Create `src/components/CourtFlash.tsx`:

```tsx
import { View } from "react-native";
import { type ReactionDirection } from "../lib/reaction";
import { colors, radius, spacing } from "../theme";

// A mini court drawn with plain Views: a tennis ball positioned left/center/
// right above a net bar. No media, no SVG — pure layout + color.
export default function CourtFlash({ direction }: { direction: ReactionDirection }) {
  const justify =
    direction === "left" ? "flex-start" : direction === "right" ? "flex-end" : "center";

  return (
    <View
      testID="court-flash"
      style={{
        width: 240,
        height: 240,
        borderRadius: radius.lg,
        backgroundColor: "rgba(255,255,255,0.15)",
        borderWidth: 2,
        borderColor: "rgba(255,255,255,0.5)",
        padding: spacing.lg,
        justifyContent: "space-between",
      }}
    >
      {/* Ball row — aligned by direction */}
      <View style={{ flex: 1, flexDirection: "row", justifyContent: justify, alignItems: "center" }}>
        <View
          testID={`court-ball-${direction}`}
          style={{
            width: 48,
            height: 48,
            borderRadius: radius.pill,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: "rgba(255,255,255,0.9)",
          }}
        />
      </View>
      {/* Net bar */}
      <View
        testID="court-net"
        style={{
          height: 12,
          borderRadius: radius.sm,
          backgroundColor: "rgba(255,255,255,0.85)",
        }}
      />
    </View>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/ src/components/__tests__/CourtFlash.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CourtFlash.tsx src/components/__tests__/CourtFlash.test.tsx
git commit -m "feat: CourtFlash graphic for reaction direction cues"
```

---

### Task 3: Wire direction + flash into the Player

**Files:**
- Modify: `src/app/(app)/player/[id].tsx`
- Test: `src/app/__tests__/player.test.tsx`

**Interfaces:**
- Consumes: `pickDirection`, `ReactionDirection` (Task 1); `CourtFlash` (Task 2).
- Produces: no new exports.

**Context — current player reaction driver** (`src/app/(app)/player/[id].tsx`). The reaction effect currently reads:

```tsx
  // Reaction driver: on reaction work steps, fire random call-outs.
  useEffect(() => {
    if (paused || !step || step.kind !== "work" || !step.reaction) return;
    const pool = readPool(step.exercise.config);
    if (pool.length === 0) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        const move = pickMove(pool);
        if (move) {
          setCall(move);
          if (move.audioUrl == null) speak(move.call); // recorded audio deferred
        }
        schedule();
      }, nextDelayMs(step.reaction!.minSecs, step.reaction!.maxSecs));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [paused, step, index]);
```

The central render area currently shows the countdown:

```tsx
      <Text style={{ fontSize: 88, fontWeight: "800", color: onBg, fontVariant: ["tabular-nums"] }}>
        {remaining}
      </Text>
```

- [ ] **Step 1: Add a reaction-enabled fixture + failing test**

In `src/app/__tests__/player.test.tsx`, add a second mocked workout and a
test. Keep the existing `mockGetWorkout` default for the current tests;
add a reaction case by overriding the mock inside the new test. Add
`pickDirection` determinism by NOT mocking it (it uses Math.random) —
instead assert on the *set* of possible spoken values.

Append this test (and add `act` is already imported):

```tsx
test("on a reaction call-out, speaks a direction and flashes the court", async () => {
  jest.useFakeTimers();
  mockGetWorkout.mockResolvedValueOnce({
    id: "w1",
    name: "Reaction WOD",
    settings: { workSecs: 30, restSecs: 0, sets: 1, reactionMinSecs: 1, reactionMaxSecs: 1 },
    exercises: [
      {
        id: "r1",
        name: "Volley",
        type: "reaction",
        mediaUrl: null,
        config: { pool: [{ call: "Volley", media_url: null, audio_url: null }] },
      },
    ],
  });

  const { findByText, getByTestId } = await render(<Player />);
  await findByText("Volley");

  // advance past the ~1s call-out interval
  await act(async () => {
    jest.advanceTimersByTime(1100);
  });

  // a direction was spoken (one of the three)
  const spokenWithDirection = mockSpeak.mock.calls
    .flat()
    .some((arg) => ["left", "center", "right"].includes(arg));
  expect(spokenWithDirection).toBe(true);

  // the court flash rendered
  expect(getByTestId("court-flash")).toBeTruthy();

  jest.useRealTimers();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/ src/app/__tests__/player.test.tsx`
Expected: FAIL — no direction is spoken (shot name is spoken instead) and `court-flash` testID is absent.

- [ ] **Step 3: Implement**

In `src/app/(app)/player/[id].tsx`:

1. Update imports:

```tsx
import { readPool, pickMove, nextDelayMs, pickDirection, type ReactionMove, type ReactionDirection } from "../../../lib/reaction";
import CourtFlash from "../../../components/CourtFlash";
```

2. Add flash state near the other `useState` hooks:

```tsx
  const [flashDir, setFlashDir] = useState<ReactionDirection | null>(null);
```

3. In the reaction driver effect, on each call-out pick a direction, speak
   it (instead of the shot name), show the flash, and clear it after ~1s.
   Replace the `setTimeout` body so it reads:

```tsx
    let flashTimer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        const move = pickMove(pool);
        if (move) {
          const dir = pickDirection();
          setCall(move);
          setFlashDir(dir);
          speak(dir); // announce the direction; shot name stays on screen
          clearTimeout(flashTimer);
          flashTimer = setTimeout(() => setFlashDir(null), 1000);
        }
        schedule();
      }, nextDelayMs(step.reaction!.minSecs, step.reaction!.maxSecs));
    };
    schedule();
    return () => {
      clearTimeout(timer);
      clearTimeout(flashTimer);
    };
```

   (Keep the effect's guard, `pool` read, and dependency array unchanged.)

4. Also clear the flash when navigating between steps: in `goTo`, alongside
   `setCall(null)`, add `setFlashDir(null)`.

5. In the central render area, show the flash in place of the countdown
   when `flashDir` is set:

```tsx
      {flashDir ? (
        <CourtFlash direction={flashDir} />
      ) : (
        <Text style={{ fontSize: 88, fontWeight: "800", color: onBg, fontVariant: ["tabular-nums"] }}>
          {remaining}
        </Text>
      )}
```

- [ ] **Step 4: Run the player suite to verify it passes**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/ src/app/__tests__/player.test.tsx`
Expected: PASS (existing tests + the new reaction test).

- [ ] **Step 5: Run the full suite**

Run: `npx jest --modulePathIgnorePatterns /.claude/ --testPathIgnorePatterns /node_modules/ /eyedropper/ /.claude/`
Expected: all suites pass.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/player/[id].tsx" src/app/__tests__/player.test.tsx
git commit -m "feat: player flashes court + speaks direction on reaction call-outs"
```

---

## Self-Review

- **Spec coverage:** `pickDirection` (Task 1) ✓; `CourtFlash` court+net+ball drawn with Views, positioned by direction (Task 2) ✓; player picks direction, speaks direction-only, flashes replacing timer, clears after ~1s, cleans up timers on teardown and step change (Task 3) ✓. Out-of-scope items (storage, upload, authored media) are not touched by any task ✓.
- **Placeholder scan:** no TBDs; every code and test step has literal content.
- **Type consistency:** `ReactionDirection` defined in Task 1, imported by Tasks 2 and 3; `pickDirection()` no-arg call in the player matches the default-param signature; `CourtFlash` prop type matches its usage. `setFlashDir(null)` type matches `ReactionDirection | null` state.
- **Test-command caveat** recorded in Global Constraints for the worktree case.
