import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import GoogleLogoColor from '../components/GoogleLogoColor';

export default function ProfileScreen() {
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.authWrap}>
          <Text style={styles.screenTitle}>Создать аккаунт</Text>
          <View style={styles.authStack}>
            <TextInput
              style={styles.input}
              value={authEmail}
              onChangeText={setAuthEmail}
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              accessibilityLabel="Email"
            />
            <TextInput
              style={styles.input}
              value={authPassword}
              onChangeText={setAuthPassword}
              placeholder="Пароль"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              accessibilityLabel="Пароль"
            />

            <Pressable
              onPress={() => {
                if (!authEmail.trim() || !authPassword.trim()) return;
                setAuthLoading(true);
                setTimeout(() => setAuthLoading(false), 1500);
              }}
              style={[
                styles.submitBtn,
                (!authEmail.trim() || !authPassword.trim() || authLoading) &&
                  styles.submitBtnDisabled,
              ]}
              disabled={!authEmail.trim() || !authPassword.trim() || authLoading}
              accessibilityRole="button"
              accessibilityLabel="Создать аккаунт"
            >
              {authLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Создать аккаунт</Text>
              )}
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>или</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.googleBtn,
                pressed && styles.googleBtnPressed,
              ]}
              onPress={() => {}}
              accessibilityRole="button"
              accessibilityLabel="Продолжить с Google"
            >
              <GoogleLogoColor size={22} />
              <Text style={styles.googleBtnText}>Продолжить с Google</Text>
            </Pressable>
          </View>
          <Text style={styles.screenHint}>
            Создайте аккаунт, чтобы сохранить доступ к агенту, настройкам и диалогам — и
            не потерять их при смене устройства или браузера.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const FORM_MAX = 400;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 32,
    ...(Platform.OS === 'web' && { minHeight: '100%' }),
  },
  authWrap: {
    width: '100%',
    maxWidth: FORM_MAX,
    alignSelf: 'center',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 24,
  },
  authStack: {
    gap: 12,
  },
  screenHint: {
    marginTop: 20,
    fontSize: 14,
    lineHeight: 21,
    color: '#6B7280',
    textAlign: 'center',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: '#111111',
  },
  googleBtnPressed: {
    opacity: 0.88,
  },
  googleBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D1D5DB',
  },
  dividerText: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  input: {
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  submitBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});
