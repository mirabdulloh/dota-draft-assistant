import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { C } from './src/theme';
import { useDraft } from './src/store';
import { DraftSetup } from './src/screens/DraftSetup';
import { DraftBoard } from './src/screens/DraftBoard';
import { ItemBuildScreen } from './src/screens/ItemBuild';
import { HeroPicker } from './src/components/HeroPicker';

export default function App() {
  const started = useDraft((s) => s.started);
  const showItems = useDraft((s) => s.showItems);
  return (
    <SafeAreaView style={st.root}>
      <StatusBar style="light" />
      {!started ? <DraftSetup /> : showItems ? <ItemBuildScreen /> : <DraftBoard />}
      <HeroPicker />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
});
