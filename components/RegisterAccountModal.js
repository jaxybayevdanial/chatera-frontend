import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { registerWithEmailPassword } from '../api/chatera';

const PASSWORD_MIN = 8;

export default function RegisterAccountModal({ visible, onClose, onRegistered }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);

  useEffect(() => {
    if (!visible) {
      setError('');
      setPassword('');
    }
  }, [visible]);

  const submit = useCallback(async () => {
    if (inFlight.current || loading) return;
    setError('');
    const em = email.trim();
    if (!em) {
      setError('Введите email');
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Пароль не короче ${PASSWORD_MIN} символов`);
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const data = await registerWithEmailPassword({ email: em, password });
      const msg =
        (typeof data?.message === 'string' && data.message) ||
        'Аккаунт создан.';
      Alert.alert('Готово', msg);
      onRegistered?.();
    } catch (e) {
      setError(e?.message || 'Не удалось зарегистрироваться');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, [email, password, loading, onRegistered]);

  const canSubmit =
    email.trim().length > 0 && password.length >= PASSWORD_MIN && !loading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        enabled={Platform.OS !== 'web'}
      >
        <View style={styles.body}>
          <View style={styles.header}>
            <Text style={styles.title}>Создать аккаунт</Text>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
            >
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.lead}>
              После создания аккаунта настройки и агент будут привязаны к аккаунту — их не потеряете при
              смене устройства.
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError('');
              }}
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              accessibilityLabel="Email"
            />
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError('');
              }}
              placeholder={`Пароль (мин. ${PASSWORD_MIN} символов)`}
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              accessibilityLabel="Пароль"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              onPress={submit}
              disabled={!canSubmit}
              style={[
                styles.submitBtn,
                (!canSubmit || loading) && styles.submitBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Создать аккаунт"
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Создать аккаунт</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  body: {
    flex: 1,
    paddingTop: Platform.OS === 'web' ? 24 : 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    marginBottom: 20,
  },
  input: {
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
  },
  error: {
    fontSize: 14,
    color: '#DC2626',
    marginBottom: 8,
    marginLeft: 4,
  },
  submitBtn: {
    marginTop: 12,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    minHeight: 52,
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
