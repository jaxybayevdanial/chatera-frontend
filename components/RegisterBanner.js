import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RegisterBanner({ onPress, text }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.banner,
        pressed && styles.bannerPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Создать аккаунт, чтобы продолжить"
    >
      <View style={styles.icon}>
        <Ionicons name="person-add-outline" size={22} color="#1D4ED8" />
      </View>
      <Text style={styles.text}>
        {text || 'Создайте аккаунт, чтобы продолжить'}
      </Text>
      <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  bannerPressed: {
    opacity: 0.75,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    color: '#1D4ED8',
    fontWeight: '500',
  },
});
