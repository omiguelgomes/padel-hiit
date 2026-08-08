import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapExerciseToRow, mapDetailToPatch, ApiExercise } from "./map.ts";

const API_HOST = "edb-with-gifs-and-images-by-ascendapi.p.rapidapi.com";
const API_BASE = `https://${API_HOST}/api/v1/exercises`;

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
    if (!Array.isArray(body.data)) {
      return new Response(
        `Unexpected upstream body at cursor ${after ?? "start"}`,
        { status: 502 },
      );
    }
    const rows = (body.data as ApiExercise[]).map(mapExerciseToRow);

    const { error } = await supabase
      .from("exercises")
      .upsert(rows, { onConflict: "source,external_id" });
    if (error) {
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }

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

    synced += rows.length;

    // Fail loudly rather than silently stopping mid-sync: if upstream claims
    // another page but gives no cursor, an empty string would fall through
    // the falsy check below and end the loop with a partial (but "successful") sync.
    if (body.meta?.hasNextPage && !body.meta.nextCursor) {
      return new Response(
        "Upstream returned hasNextPage:true with empty nextCursor",
        { status: 502 },
      );
    }
    after = body.meta?.hasNextPage ? body.meta.nextCursor : undefined;
  } while (after);

  return new Response(JSON.stringify({ synced }), {
    headers: { "Content-Type": "application/json" },
  });
});
