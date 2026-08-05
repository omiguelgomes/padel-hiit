import { readPool, pickMove, nextDelayMs } from "../reaction";

describe("readPool", () => {
  test("maps spec-shaped pool entries", () => {
    const pool = readPool({
      pool: [
        { call: "Forehand", media_url: "https://x/fh.mp4", audio_url: null },
        { call: "Backhand", media_url: null, audio_url: "https://x/bh.mp3" },
      ],
    });
    expect(pool).toEqual([
      { call: "Forehand", mediaUrl: "https://x/fh.mp4", audioUrl: null },
      { call: "Backhand", mediaUrl: null, audioUrl: "https://x/bh.mp3" },
    ]);
  });

  test("returns [] for missing or malformed pool", () => {
    expect(readPool({})).toEqual([]);
    expect(readPool({ pool: "nope" as any })).toEqual([]);
    expect(readPool({ pool: [{ nocall: true } as any] })).toEqual([]);
  });
});

describe("pickMove", () => {
  const pool = [
    { call: "A", mediaUrl: null, audioUrl: null },
    { call: "B", mediaUrl: null, audioUrl: null },
  ];
  test("picks by injected randomness", () => {
    expect(pickMove(pool, () => 0)?.call).toBe("A");
    expect(pickMove(pool, () => 0.99)?.call).toBe("B");
  });
  test("returns null for an empty pool", () => {
    expect(pickMove([], () => 0)).toBeNull();
  });
});

describe("nextDelayMs", () => {
  test("interpolates between min and max in milliseconds", () => {
    expect(nextDelayMs(2, 5, () => 0)).toBe(2000);
    expect(nextDelayMs(2, 5, () => 0.5)).toBe(3500);
  });
  test("tolerates reversed bounds and clamps negatives", () => {
    expect(nextDelayMs(5, 2, () => 0)).toBe(2000);
    expect(nextDelayMs(-3, -1, () => 0)).toBe(0);
  });
});
