import ExercisePicker from "../../components/ExercisePicker";
import { Screen, ScreenTitle } from "../../components/ui";

export default function Library() {
  return (
    <Screen scroll>
      <ScreenTitle>Exercises</ScreenTitle>
      <ExercisePicker onSelect={() => {}} />
    </Screen>
  );
}
