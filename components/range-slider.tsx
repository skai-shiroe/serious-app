import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

const THUMB_SIZE = 28;
const TRACK_HEIGHT = 4;

type RangeSliderProps = {
  min: number;
  max: number;
  /** Pas d'arrondi (1 = annee entiere). */
  step?: number;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  accentColor?: string;
  trackColor?: string;
  thumbColor?: string;
};

/**
 * Slider d'intervalle a deux poignees (type « age 18 - 70 »).
 *
 * Reimplemente en interne avec Reanimated + Gesture Handler (meme techno que
 * le deck Match et la visionneuse photo) : aucune dependance native, donc pas
 * de rebuild ni de risque de rupture de compatibilite. Les deux poignees ne
 * peuvent pas se croiser (ecart minimum = step) et les valeurs sont always
 * alignees sur le pas.
 */
export default function RangeSlider({
  min,
  max,
  step = 1,
  low,
  high,
  onChange,
  accentColor = '#f43f5e',
  trackColor = '#e5e7eb',
  thumbColor = '#ffffff',
}: RangeSliderProps) {
  const [trackWidth, setTrackWidth] = useState(0);

  // Positions en pixels (0..trackWidth), partagees UI/JS.
  const lowX = useSharedValue(0);
  const highX = useSharedValue(0);
  // Position de depart de chaque drag (translation du doigt ajoutee).
  const startLowX = useSharedValue(0);
  const startHighX = useSharedValue(0);
  // Vrai pendant un drag : le resync externe (useEffect) ne doit pas ecraser
  // la position du doigt avec la valeur arrondie (evite le tremblement).
  const dragging = useSharedValue(false);

  const valueToX = useCallback(
    (value: number) =>
      max > min ? ((value - min) / (max - min)) * trackWidth : 0,
    [min, max, trackWidth]
  );
  const xToValue = useCallback(
    (x: number) => {
      if (trackWidth <= 0) return min;
      const raw = min + (x / trackWidth) * (max - min);
      const snapped = Math.round(raw / step) * step;
      return Math.min(max, Math.max(min, snapped));
    },
    [min, max, step, trackWidth]
  );

  // Resynchronisation quand les valeurs changent de l'exterieur (le draft du
  // modal filtres est reinitialise a chaque ouverture). Ignore pendant un
  // drag : la valeur JS (arrondie) est en retard sur le doigt, l'ecraser
  // ferait trembler la poignee.
  useEffect(() => {
    if (trackWidth <= 0 || dragging.value) return;
    lowX.value = valueToX(low);
    highX.value = valueToX(high);
  }, [low, high, trackWidth, valueToX, lowX, highX, dragging]);

  const notify = useCallback(() => {
    if (trackWidth <= 0) return;
    onChange(xToValue(lowX.value), xToValue(highX.value));
  }, [trackWidth, onChange, xToValue, lowX, highX]);

  // Ecart minimum entre les poignees, en pixels (une fois le pas).
  const minGapX = max > min ? (step / (max - min)) * trackWidth : 0;

  const panLow = Gesture.Pan()
    // Horizontal uniquement : le scroll vertical du modal reste libre.
    .activeOffsetX([-10, 10])
    .onBegin(() => {
      dragging.value = true;
      startLowX.value = lowX.value;
    })
    .onUpdate((event) => {
      const next = Math.min(
        Math.max(0, startLowX.value + event.translationX),
        highX.value - minGapX
      );
      lowX.value = next;
      runOnJS(notify)();
    })
    .onEnd(() => {
      dragging.value = false;
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  const panHigh = Gesture.Pan()
    // Horizontal uniquement : le scroll vertical du modal reste libre.
    .activeOffsetX([-10, 10])
    .onBegin(() => {
      dragging.value = true;
      startHighX.value = highX.value;
    })
    .onUpdate((event) => {
      const next = Math.max(
        Math.min(trackWidth, startHighX.value + event.translationX),
        lowX.value + minGapX
      );
      highX.value = next;
      runOnJS(notify)();
    })
    .onEnd(() => {
      dragging.value = false;
    })
    .onFinalize(() => {
      dragging.value = false;
    });

  const lowThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: lowX.value - THUMB_SIZE / 2 }],
  }));
  const highThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highX.value - THUMB_SIZE / 2 }],
  }));
  const filledStyle = useAnimatedStyle(() => ({
    left: lowX.value,
    width: Math.max(0, highX.value - lowX.value),
  }));

  return (
    <View style={styles.container}>
      <View
        style={styles.rail}
        onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      >
        <View style={[styles.track, { backgroundColor: trackColor }]}>
          <Animated.View
            style={[styles.filled, { backgroundColor: accentColor }, filledStyle]}
          />
        </View>

        <GestureDetector gesture={panLow}>
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: thumbColor, borderColor: accentColor },
              lowThumbStyle,
            ]}
          />
        </GestureDetector>
        <GestureDetector gesture={panHigh}>
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: thumbColor, borderColor: accentColor },
              highThumbStyle,
            ]}
          />
        </GestureDetector>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 44,
    justifyContent: 'center',
  },
  // Zone reellement mesuree : les pouces se deplacent de 0 a trackWidth,
  // centres sur les extremites de la piste (margin vertical pour les laisser
  // deborder sans que le container les rogne).
  rail: {
    height: TRACK_HEIGHT,
    justifyContent: 'center',
    // Espace pour que les pouces restent entierement visibles aux extremites.
    marginHorizontal: THUMB_SIZE / 2,
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    overflow: 'hidden',
  },
  filled: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  thumb: {
    position: 'absolute',
    // Centre le pouce de 28 px sur la piste de 4 px.
    top: -(THUMB_SIZE - TRACK_HEIGHT) / 2,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    borderWidth: 2,
    // Ombre legere : repere visuel des poignees sur la piste.
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
});
