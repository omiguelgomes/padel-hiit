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
