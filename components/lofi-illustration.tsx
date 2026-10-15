import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

// Scène de l'illustration : taille fixe, overflow hidden. Le WebView est en
// absoluteFill DEDANS pour qu'il ne puisse jamais s'étendre au-delà de la
// scène (et décaler les textes de la slide vers le bas).
export const LOFI_STAGE = {
    width: Math.min(260, width - 96),
    height: 140,
} as const;

// Les SVG lofi (exports LottieFiles) sont animés via SMIL (<animate>,
// <animateTransform>). react-native-svg ne supporte pas ces balises
// (upstream #1724) et les éléments partent même de visibility="hidden" :
// le rendu natif serait donc vide. La WebView (WebKit/Blink) joue le SMIL
// nativement.
const htmlDoc = (xml: string) =>
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<style>' +
    'html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden;}' +
    '#r{width:100%;height:100%;display:flex;align-items:center;justify-content:center;}' +
    'svg{display:block;width:100%;height:100%;}' +
    '</style></head><body><div id="r">' + xml + '</div></body></html>';

interface LofiIllustrationProps {
    xml: string;
}

/** Illustration SVG animée (style lofi) pour l'onboarding. Pointer-events
 *  coupés : purement décorative, superposée à rien. */
export function LofiIllustration({ xml }: LofiIllustrationProps) {
    const html = useMemo(() => htmlDoc(xml), [xml]);

    return (
        <View style={styles.stage} pointerEvents="none">
            <WebView
                originWhitelist={['*']}
                source={{ html }}
                style={[StyleSheet.absoluteFill, styles.webview]}
                scrollEnabled={false}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                javaScriptEnabled
                domStorageEnabled={false}
                bounces={false}
                overScrollMode="never"
                androidLayerType="hardware"
                setSupportMultipleWindows={false}
                pointerEvents="none"
            />
        </View>
    );
}

const styles = StyleSheet.create({
    stage: {
        width: LOFI_STAGE.width,
        height: LOFI_STAGE.height,
        overflow: 'hidden',
    },
    webview: {
        backgroundColor: 'transparent',
        borderWidth: 0,
    },
});
