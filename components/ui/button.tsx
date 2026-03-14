import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { StyleSheet, Text, TextStyle, TouchableOpacity, TouchableOpacityProps, ViewStyle } from 'react-native';

interface ButtonProps extends TouchableOpacityProps {
    children: React.ReactNode;
    className?: string; // Kept for compatibility if we decide to use tw later, though we'll use style here
    style?: ViewStyle;
    textStyle?: TextStyle;
    colors?: readonly [string, string, ...string[]];
}

export function Button({
    children,
    style,
    textStyle,
    colors = ['#f43f5e', '#ec4899'], // default to rose-500 to pink-500
    ...props
}: ButtonProps) {
    return (
        <TouchableOpacity activeOpacity={0.8} style={[styles.button, style]} {...props}>
            <LinearGradient
                colors={colors}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.gradient}
            >
                <Text style={[styles.text, textStyle]}>
                    {children}
                </Text>
            </LinearGradient>
        </TouchableOpacity>

    );
}

const styles = StyleSheet.create({
    button: {
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 5,
        borderRadius: 9999, // full rounded
        overflow: 'hidden',
    },
    gradient: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        paddingHorizontal: 24,
        borderRadius: 9999,
    },
    text: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
    }
});
