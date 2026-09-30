import { CITIES, normalizeText } from '@/lib/cities';
import { Check, Search, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

export type CityPickerTheme = {
  text: string;
  textMuted: string;
  bgCard: string;
  border: string;
  inputBg: string;
  /** Optionnel : repli sur `textMuted`. */
  icon?: string;
  /** Optionnel : repli sur la couleur principale de l'app. */
  accent?: string;
};

type CityPickerModalProps = {
  visible: boolean;
  selectedCity?: string | null;
  title?: string;
  showAllCitiesOption?: boolean;
  allCitiesLabel?: string;
  placeholder?: string;
  emptyMessage?: string;
  theme: CityPickerTheme;
  onSelect: (city: string) => void;
  onClose: () => void;
};

/**
 * Sélecteur de ville commun : feuille basse avec recherche insensible aux
 * accents. La requête interne est réinitialisée à chaque ouverture.
 */
export default function CityPickerModal({
  visible,
  selectedCity = '',
  title = 'Votre ville',
  showAllCitiesOption = false,
  allCitiesLabel = 'Toutes les villes',
  placeholder = 'Rechercher une ville...',
  emptyMessage = 'Aucune ville trouvée.',
  theme,
  onSelect,
  onClose,
}: CityPickerModalProps) {
  const [query, setQuery] = useState('');
  const wasVisibleRef = useRef(visible);

  useEffect(() => {
    if (visible && !wasVisibleRef.current) {
      setQuery('');
    }
    wasVisibleRef.current = visible;
  }, [visible]);

  const visibleCities = useMemo(() => {
    const normalizedQuery = normalizeText(query.trim());
    if (!normalizedQuery) return CITIES;
    return CITIES.filter((city) => normalizeText(city).includes(normalizedQuery));
  }, [query]);

  const iconColor = theme.icon ?? theme.textMuted;
  const accentColor = theme.accent ?? '#f43f5e';

  const handleClose = () => {
    setQuery('');
    onClose();
  };

  const handleSelect = (city: string) => {
    setQuery('');
    onSelect(city);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: theme.bgCard }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X color={iconColor} size={22} />
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.search,
              { backgroundColor: theme.inputBg, borderColor: theme.border },
            ]}
          >
            <Search color={iconColor} size={18} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder={placeholder}
              placeholderTextColor={iconColor}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <X color={iconColor} size={16} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={showAllCitiesOption ? ['', ...visibleCities] : visibleCities}
            keyExtractor={(city, index) => (city === '' ? 'all' : city + index)}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isSelected = selectedCity === item;
              const label = item === '' ? allCitiesLabel : item;
              return (
                <TouchableOpacity
                  style={[styles.row, { borderBottomColor: theme.border }]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={{
                      color: isSelected ? accentColor : theme.text,
                      fontSize: 16,
                      fontWeight: isSelected ? '700' : '400',
                    }}
                  >
                    {label}
                  </Text>
                  {isSelected && <Check color={accentColor} size={18} />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={[styles.empty, { color: theme.textMuted }]}>{emptyMessage}</Text>
            }
          />
        </View>
      </View>
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
    maxHeight: '75%',
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
  empty: { textAlign: 'center', paddingVertical: 24, fontSize: 15 },
});
