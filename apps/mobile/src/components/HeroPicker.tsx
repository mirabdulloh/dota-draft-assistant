import { useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  FlatList,
  StyleSheet,
} from 'react-native';
import { C, S, portraitUrl } from '../theme';
import { heroes, type HeroMeta } from '../snapshot';
import { useDraft } from '../store';

const COLS = 4;

export function HeroPicker() {
  const picking = useDraft((s) => s.picking);
  const assign = useDraft((s) => s.assign);
  const close = useDraft((s) => s.openPicker);
  const enemies = useDraft((s) => s.enemies);
  const allies = useDraft((s) => s.allies);
  const [query, setQuery] = useState('');

  const taken = useMemo(
    () => new Set([...enemies, ...allies].filter((x): x is number => x != null)),
    [enemies, allies],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? heroes.filter((h) => h.name.toLowerCase().includes(q)) : heroes;
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [query]);

  const onClose = () => {
    setQuery('');
    close(null);
  };

  const renderItem = ({ item }: { item: HeroMeta }) => {
    const used = taken.has(item.id);
    return (
      <Pressable
        disabled={used}
        onPress={() => {
          assign(item.id);
          setQuery('');
        }}
        style={[st.cell, used && st.cellUsed]}
      >
        <Image source={{ uri: portraitUrl(item.slug) }} style={st.portrait} />
        <Text numberOfLines={1} style={[st.cellName, used && st.cellNameUsed]}>
          {item.name}
        </Text>
      </Pressable>
    );
  };

  return (
    <Modal visible={picking != null} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={st.root}>
        <View style={st.header}>
          <Text style={st.title}>
            {picking?.team === 'enemy' ? 'Add enemy hero' : 'Add ally hero'}
          </Text>
          {/* Every state exits in one tap. */}
          <Pressable onPress={onClose} style={st.close} hitSlop={12}>
            <Text style={st.closeText}>Close</Text>
          </Pressable>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search heroes"
          placeholderTextColor={C.faint}
          autoCorrect={false}
          // Focused on open: under a pick timer, tapping the field before you
          // can type is a tap you do not have time for.
          autoFocus
          style={st.search}
        />

        <FlatList
          data={results}
          keyExtractor={(h) => String(h.id)}
          numColumns={COLS}
          renderItem={renderItem}
          columnWrapperStyle={{ gap: S.gap }}
          contentContainerStyle={{ padding: S.pad, gap: S.gap, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={st.empty}>No hero matches “{query}”.</Text>}
        />
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.pad,
    paddingTop: 54,
    paddingBottom: 10,
  },
  title: { color: C.text, fontSize: 19, fontWeight: '700' },
  close: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 6 },
  closeText: { color: C.accent, fontSize: 16, fontWeight: '600' },
  search: {
    marginHorizontal: S.pad,
    minHeight: S.tap,
    backgroundColor: C.surface,
    borderRadius: S.radius,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: S.pad,
    color: C.text,
    fontSize: 16,
  },
  cell: { flex: 1 / COLS, maxWidth: `${100 / COLS}%` },
  cellUsed: { opacity: 0.25 },
  portrait: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 6,
    backgroundColor: C.surfaceAlt,
  },
  cellName: { color: C.dim, fontSize: 11, marginTop: 3 },
  cellNameUsed: { color: C.faint },
  empty: { color: C.faint, textAlign: 'center', marginTop: 30 },
});
