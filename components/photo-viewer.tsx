import { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { IMAGE_CACHE_POLICY, imageSource } from '@/lib/images';

type PhotoViewerProps = {
  /** La modale n'est rendue que si `visible` est vraie. */
  visible: boolean;
  /** Liste des photos deja filtrees (aucun trou). */
  photos: string[];
  /** Index de la photo a ouvrir. */
  index: number;
  onClose: () => void;
};

/**
 * Visionneuse plein ecran des photos du profil.
 * Motif repris de l'apercu de documents de l'ecran admin
 * (app/admin/verifications.tsx) : fond noir, fade, bouton X.
 * Navigation entre les photos au swipe (FlatList paginee) ;
 * le tap sur l'image ne ferme PAS (evite les fermetures accidentelles).
 */
export default function PhotoViewer({ visible, photos, index, onClose }: PhotoViewerProps) {
  const { width, height } = Dimensions.get('window');
  const listRef = useRef<FlatList<string>>(null);
  const [current, setCurrent] = useState(index);

  // A chaque (re)ouverture : on repart sur la photo demandee.
  useEffect(() => {
    if (!visible) return;
    setCurrent(index);
    const timer = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: index * width, animated: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, index, width]);

  if (!photos.length) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.close}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Fermer"
        >
          <X color="#ffffff" size={26} />
        </TouchableOpacity>

        {photos.length > 1 && (
          <View style={styles.counter}>
            <Text style={styles.counterText}>
              {current + 1} / {photos.length}
            </Text>
          </View>
        )}

        <FlatList
          ref={listRef}
          data={photos}
          keyExtractor={(_, i) => `photo-${i}`}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={index}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => {
            const next = Math.round(e.nativeEvent.contentOffset.x / width);
            if (next !== current && next >= 0 && next < photos.length) setCurrent(next);
          }}
          renderItem={({ item }) => (
            <View style={{ width, height }}>
              <Image
                source={imageSource(item)}
                style={{ width, height }}
                contentFit="contain"
                transition={120}
                cachePolicy={IMAGE_CACHE_POLICY}
              />
            </View>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.96)',
    justifyContent: 'center',
  },
  close: {
    position: 'absolute',
    top: 48,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  counter: {
    position: 'absolute',
    top: 54,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  counterText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },
});
