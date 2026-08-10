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
