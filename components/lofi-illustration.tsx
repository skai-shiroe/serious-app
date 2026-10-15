import React, { useMemo } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

// Scène de l'illustration : conservée identique côté placeholder pour garder
// la mise en page stable quand la WebView n'est pas montée.
export const LOFI_STAGE = {
    width: Math.min(260, width - 96),
    height: 176,
} as const;

// Les SVG lofi (exports LottieFiles) sont animés via SMIL (<animate>,
// <animateTransform>). react-native-svg ne supporte pas ces balises
// (upstream #1724) et les éléments partent même de visibility="hidden" :
// le rendu natif serait donc vide. La WebView (WebKit/Blink) joue le SMIL
// nativement — d'où ce composant, avec JS désactivé (le SMIL n'en a pas besoin).
const htmlDoc = (xml: string) =>
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
    `<style>` +
    `html,body{margin:0;padding:0;height:100%;width:100%;background:transparent;overflow:hidden;}` +
    `body{display:flex;align-items:center;justify-content:center;}` +
    `svg{max-width:100%;max-height:100%;width:100%;height:100%;}` +
    `</style></head><body>${xml}</body></html>`;

interface LofiIllustrationProps {
    xml: string;
}

/** Illustration SVG animée (style lofi) pour l'onboarding. Pointer-events
 *  coupés : purement décorative, superposée à rien. */
export function LofiIllustration({ xml }: LofiIllustrationProps) {
    const html = useMemo(() => htmlDoc(xml), [xml]);

    return (
        <WebView
            originWhitelist={['*']}
            source={{ html }}
            style={styles.webview}
            javaScriptEnabled={false}
            domStorageEnabled={false}
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            androidLayerType="hardware"
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        />
    );
}

const styles = StyleSheet.create({
    webview: {
        width: LOFI_STAGE.width,
        height: LOFI_STAGE.height,
        backgroundColor: 'transparent',
        borderWidth: 0,
    },
});
