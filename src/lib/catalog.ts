import { supabase } from "./supabase";

export type CatalogExercise = {
  id: string;
  name: string;
  type: "standard" | "reaction";
  source: "exercisedb" | "padel" | "custom";
  mediaUrl: string | null;
  gifUrl: string | null;
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
    gifUrl: r.gif_url ?? null,
    config: r.config ?? {},
  }));
}

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
