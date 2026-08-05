import { View } from "react-native";
import ExercisePicker from "../../components/ExercisePicker";

export default function Library() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <ExercisePicker onSelect={() => {}} />
    </View>
  );
}
