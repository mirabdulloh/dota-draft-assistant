import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';
import { C } from './src/theme';
import { useDraft } from './src/store';
import { DraftSetup } from './src/screens/DraftSetup';
import { DraftBoard } from './src/screens/DraftBoard';
import { HeroPicker } from './src/components/HeroPicker';

export default function App() {
  const started = useDraft((s) => s.started);
  return (
    <SafeAreaView style={st.root}>
      <StatusBar style="light" />
      {started ? <DraftBoard /> : <DraftSetup />}
      <HeroPicker />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
});
