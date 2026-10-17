import { Check, Search, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { normalizeText } from '@/lib/cities';
import { fetchCountries, type Country } from '@/lib/countries';

type CountryPickerTheme = {
  text: string;
  textMuted: string;
  bgCard: string;
  border: string;
  inputBg: string;
  icon?: string;
  accent?: string;
};

type CountryPickerModalProps = {
  visible: boolean;
  selectedCode?: string | null;
  theme: CountryPickerTheme;
  onSelect: (country: Country) => void;
  onClose: () => void;
};

/**
 * Selecteur de pays (drapeau + indicatif) : feuille basse avec recherche,
 * meme pattern que CityPickerModal. Liste = table `countries` (bloc 11),
 * pays actifs uniquement, memoisee par lib/countries.
 */
export default function CountryPickerModal({
  visible,
  selectedCode = '',
  theme,
  onSelect,
  onClose,
}: CountryPickerModalProps) {
  const [query, setQuery] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const wasVisibleRef = useRef(visible);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setQuery('');
      fetchCountries().then(setCountries).catch(() => {});
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  const visibleCountries = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());
    if (!normalizedQuery) return countries;
    return countries.filter(
      (c) =>
        normalizeText(c.name).includes(normalizedQuery) ||
        normalizeText(c.dial_code).includes(normalizedQuery)
    );
  }, [countries, query]);

  const iconColor = theme.icon ?? theme.textMuted;
  const accentColor = theme.accent ?? '#f43f5e';

  const handleSelect = (country: Country) => {
    setQuery('');
    onSelect(country);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: theme.bgCard }]}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: theme.text }]}>Pays</Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X color={iconColor} size={22} />
              </TouchableOpacity>
            </View>

            <View
              style={[styles.search, { backgroundColor: theme.inputBg, borderColor: theme.border }]}
            >
              <Search color={iconColor} size={18} />
              <TextInput
                style={[styles.searchInput, { color: theme.text }]}
                placeholder="Rechercher un pays..."
                placeholderTextColor={iconColor}
                value={query}
                onChangeText={setQuery}
                autoCorrect={false}
              />
            </View>

            <FlatList
              data={visibleCountries}
              keyExtractor={(country) => country.code}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const isSelected = selectedCode === item.code;
                return (
                  <TouchableOpacity
                    style={[styles.row, { borderBottomColor: theme.border }]}
                    onPress={() => handleSelect(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.rowLeft}>
                      <Text style={styles.flag}>{item.flag}</Text>
                      <Text
                        style={{
                          color: isSelected ? accentColor : theme.text,
                          fontSize: 16,
                          fontWeight: isSelected ? '700' : '400',
                        }}
                      >
                        {item.name}
                      </Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={{ color: theme.textMuted, fontSize: 15 }}>{item.dial_code}</Text>
                      {isSelected && <Check color={accentColor} size={18} />}
                    </View>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <Text style={[styles.empty, { color: theme.textMuted }]}>Aucun pays trouvé.</Text>
              }
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 20, fontWeight: 'bold' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 16, height: '100%' },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flag: { fontSize: 22 },
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 15 },
});

