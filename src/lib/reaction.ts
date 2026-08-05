// src/lib/reaction.ts
// Pure helpers for the reaction driver. Randomness is injected so the Player's
// call-out behaviour is deterministic under test.

export type ReactionMove = {
  call: string;
  mediaUrl: string | null;
  audioUrl: string | null;
};

// Read the per-exercise call-out pool from an exercise's config.
// Spec shape: config.pool = [{ call, media_url, audio_url }]
export function readPool(config: Record<string, unknown>): ReactionMove[] {
  const raw = (config as any)?.pool;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.call === "string")
    .map((m) => ({
      call: m.call,
      mediaUrl: m.media_url ?? null,
      audioUrl: m.audio_url ?? null,
    }));
}

export function pickMove(
  pool: ReactionMove[],
  rnd: () => number = Math.random,
): ReactionMove | null {
  if (pool.length === 0) return null;
  return pool[Math.floor(rnd() * pool.length)];
}

// A random delay in ms within [min, max] seconds. Bounds are normalised
// (reversed order tolerated) and clamped at zero.
export function nextDelayMs(
  minSecs: number,
  maxSecs: number,
  rnd: () => number = Math.random,
): number {
  const lo = Math.max(0, Math.min(minSecs, maxSecs));
  const hi = Math.max(0, Math.max(minSecs, maxSecs));
  return Math.round((lo + rnd() * (hi - lo)) * 1000);
}
