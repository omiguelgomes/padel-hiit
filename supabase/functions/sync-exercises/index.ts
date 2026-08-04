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
