import { useMemo, useState } from 'react';
import {
  Dimensions,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Search } from 'lucide-react-native';
import { EMOJI_CATEGORIES, searchEmojis } from '@/lib/emojis';
import { STICKERS } from '@/lib/stickers';
import { IMAGE_CACHE_POLICY } from '@/lib/images';

export type ComposerTab = 'emoji' | 'stickers';

type PanelProps = {
  tab: ComposerTab;
  onTabChange: (tab: ComposerTab) => void;
  onPickEmoji: (emoji: string) => void;
  /** Un sticker part IMMEDIATEMENT (comme WhatsApp), il n'est pas insere dans le texte. */
  onPickSticker: (name: string) => void;
  isDark: boolean;
};

const PANEL_HEIGHT = 280;
const EMOJI_COLUMNS = 8;
const STICKER_COLUMNS = 4;

/**
 * Panneau Emoji / Stickers qui remplace le clavier sous la barre de saisie
 * (placement WhatsApp). Onglets en haut, grille dedans ; tap emoji -> insere
 * dans le texte, tap sticker -> envoi immediate.
 */
export default function EmojiStickerPanel({
  tab,
  onTabChange,
  onPickEmoji,
  onPickSticker,
  isDark,
}: PanelProps) {
  const { width } = Dimensions.get('window');
  const [query, setQuery] = useState('');

  const themeColors = {
    bg: isDark ? '#1f2937' : '#ffffff',
    border: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#ffffff' : '#111827',
    textMuted: isDark ? '#9ca3af' : '#6b7280',
    inputBg: isDark ? '#374151' : '#f3f4f6',
    active: '#f43f5e',
  };

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const found = searchEmojis(q);
      return found.length ? [{ title: 'Résultats', icon: '🔍', data: found }] : [];
    }
    return EMOJI_CATEGORIES.map((c) => ({ title: c.label, icon: c.icon, data: c.emojis }));
  }, [query]);

  const emojiCellSize = Math.floor(width / EMOJI_COLUMNS);
  const stickerCellSize = Math.floor(width / STICKER_COLUMNS) - 16;

  return (
    <View style={[styles.panel, { backgroundColor: themeColors.bg, borderTopColor: themeColors.border }]}>
      {/* Onglets (placement WhatsApp : en haut du panneau) */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'emoji' && { borderBottomColor: themeColors.active, borderBottomWidth: 2 }]}
          onPress={() => onTabChange('emoji')}
        >
          <Text style={[styles.tabLabel, { color: tab === 'emoji' ? themeColors.active : themeColors.textMuted }]}>
            Émojis
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'stickers' && { borderBottomColor: themeColors.active, borderBottomWidth: 2 }]}
          onPress={() => onTabChange('stickers')}
        >
          <Text style={[styles.tabLabel, { color: tab === 'stickers' ? themeColors.active : themeColors.textMuted }]}>
            Stickers
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'emoji' ? (
        <>
          <View style={[styles.searchWrap, { backgroundColor: themeColors.inputBg }]}>
            <Search size={16} color={themeColors.textMuted} />
            <TextInput
              style={[styles.searchInput, { color: themeColors.text }]}
              placeholder="Rechercher (coeur, nature…)"
              placeholderTextColor={themeColors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => `${item}-${index}`}
            stickySectionHeadersEnabled={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.gridContent}
            renderSectionHeader={({ section }) => (
              <Text style={[styles.sectionTitle, { color: themeColors.textMuted }]}>
                {section.icon}  {section.title}
              </Text>
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={{ width: emojiCellSize, height: emojiCellSize, justifyContent: 'center', alignItems: 'center' }}
                onPress={() => onPickEmoji(item)}
                activeOpacity={0.6}
              >
                <Text style={{ fontSize: 28 }}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <View style={styles.stickerWrap}>
          {STICKERS.map((sticker) => (
            <TouchableOpacity
              key={sticker.name}
              style={[styles.stickerCell, { width: stickerCellSize, height: stickerCellSize }]}
              onPress={() => onPickSticker(sticker.name)}
              activeOpacity={0.7}
              accessibilityLabel={sticker.label}
            >
              <Image
                source={sticker.source}
                style={{ width: stickerCellSize - 12, height: stickerCellSize - 12 }}
                contentFit="contain"
                cachePolicy={IMAGE_CACHE_POLICY}
              />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    height: PANEL_HEIGHT,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    gap: 20,
  },
  tab: {
    paddingVertical: 10,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 36,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  gridContent: {
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 2,
  },
  stickerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingTop: 8,
    gap: 8,
  },
  stickerCell: {
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(120,120,120,0.08)',
  },
});
