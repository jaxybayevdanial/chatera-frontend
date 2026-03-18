import React, {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Platform,
  Linking,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

function generatePairCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let a = '',
    b = '';
  for (let i = 0; i < 4; i++) {
    a += chars[Math.floor(Math.random() * chars.length)];
    b += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${a}-${b}`;
}

function digitsOnly(s) {
  return (s || '').replace(/\D/g, '');
}

function formatPhoneDisplay(d) {
  if (d.length <= 0) return '';
  if (d.length <= 1) return `+${d}`;
  const c = d.slice(0, 1);
  const rest = d.slice(1);
  if (c === '7' && rest.length > 0) {
    let x = rest;
    const parts = [];
    if (x.length > 0) parts.push(x.slice(0, 3));
    if (x.length > 3) parts.push(x.slice(3, 6));
    if (x.length > 6) parts.push(x.slice(6, 8));
    if (x.length > 8) parts.push(x.slice(8, 10));
    return `+7 ${parts.filter(Boolean).join(' ')}`.trim();
  }
  return `+${d}`;
}

const IS_WEB = Platform.OS === 'web';

function resetWaPageScroll() {
  if (typeof window === 'undefined') return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export default function WaConnectScreen({ onClose, onSuccess }) {
  const [step, setStep] = useState(1);
  const [phoneDigits, setPhoneDigits] = useState('7');
  const [sending, setSending] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const webShellRef = useRef(null);

  /** Web: оболочка = точный rect visualViewport (top/left/width/height), без translate — иначе зазор над клавиатурой и съезжает вёрстка */
  const syncWebShellLayout = useCallback(() => {
    if (!IS_WEB) return;
    const el = webShellRef.current;
    if (!el) return;
    const vv = window.visualViewport;
    const innerH = window.innerHeight;
    if (vv) {
      const h = Math.max(100, Math.round(vv.height));
      el.style.top = `${Math.round(vv.offsetTop)}px`;
      el.style.left = `${Math.round(vv.offsetLeft)}px`;
      el.style.width = `${Math.round(vv.width)}px`;
      el.style.height = `${h}px`;
    } else {
      el.style.top = '0px';
      el.style.left = '0px';
      el.style.width = '100%';
      el.style.height = `${innerH}px`;
    }
    el.style.transform = 'none';
    resetWaPageScroll();
  }, []);

  useLayoutEffect(() => {
    if (!IS_WEB) return undefined;
    syncWebShellLayout();
    const vv = window.visualViewport;
    const onWinScroll = () => {
      resetWaPageScroll();
      syncWebShellLayout();
    };
    window.addEventListener('scroll', onWinScroll, { passive: false });
    if (vv) {
      vv.addEventListener('resize', syncWebShellLayout);
      vv.addEventListener('scroll', syncWebShellLayout);
    }
    window.addEventListener('resize', syncWebShellLayout);
    return () => {
      window.removeEventListener('scroll', onWinScroll);
      window.removeEventListener('resize', syncWebShellLayout);
      if (vv) {
        vv.removeEventListener('resize', syncWebShellLayout);
        vv.removeEventListener('scroll', syncWebShellLayout);
      }
    };
  }, [syncWebShellLayout]);

  const onWebInputFocus = useCallback(() => {
    if (!IS_WEB) return;
    resetWaPageScroll();
    let n = 0;
    const iv = setInterval(() => {
      syncWebShellLayout();
      n += 1;
      if (n >= 24) clearInterval(iv);
    }, 45);
  }, [syncWebShellLayout]);

  useEffect(() => {
    if (IS_WEB) return undefined;
    const showEvt =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const s = Keyboard.addListener(showEvt, (e) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const h = Keyboard.addListener(hideEvt, () => setKeyboardHeight(0));
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  const phoneOk = digitsOnly(phoneDigits).length >= 11;

  const submitPhone = useCallback(() => {
    if (!phoneOk) return;
    Keyboard.dismiss();
    setSending(true);
    setTimeout(() => {
      setSending(false);
      setPairCode(generatePairCode());
      setCodeCopied(false);
      setStep(2);
    }, 900);
  }, [phoneOk]);

  const copyCode = useCallback(async () => {
    if (!pairCode) return;
    try {
      await Clipboard.setStringAsync(pairCode.replace(/\u2013/g, '-'));
      setCodeCopied(true);
    } catch {
      Alert.alert('Не удалось скопировать');
    }
  }, [pairCode]);

  const openWhatsApp = useCallback(async () => {
    try {
      if (Platform.OS !== 'web') {
        const can = await Linking.canOpenURL('whatsapp://');
        if (can) await Linking.openURL('whatsapp://');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const displayPhone = formatPhoneDisplay(digitsOnly(phoneDigits));

  const stickFooter = !IS_WEB && keyboardHeight > 0;

  const webShellStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    zIndex: 99999,
    boxSizing: 'border-box',
    touchAction: 'manipulation',
  };

  const body = (
    <>
      <View style={styles.topBar}>
        <View style={styles.stepDots}>
          {[1, 2, 3].map((s) => (
            <View
              key={s}
              style={[styles.dot, step >= s && styles.dotActive]}
              accessibilityElementsHidden
            />
          ))}
        </View>
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
        style={styles.scrollFlex}
        contentContainerStyle={[
          styles.scrollContent,
          step === 3 && stickFooter && styles.scrollContentWithStickyFooter,
          (step === 1 || step === 2) && styles.scrollContentStep1,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && (
          <>
            <Text style={styles.phaseLabel}>Шаг 1 — номер</Text>
            <Text style={styles.leadTitle}>Введите номер WhatsApp</Text>
            <Text style={styles.subLead}>
              На него придёт уведомление со ссылкой — по ней вы введёте код и
              подтвердите привязку.
            </Text>
            <Text style={styles.inputLabel}>Телефон</Text>
            <TextInput
              style={styles.input}
              value={displayPhone}
              onChangeText={(t) => {
                const d = digitsOnly(t);
                if (d.length === 0) setPhoneDigits('');
                else setPhoneDigits(d.startsWith('7') ? d : `7${d.replace(/^7+/, '')}`);
              }}
              placeholder="+7 900 000-00-00"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              maxLength={18}
              accessibilityLabel="Номер телефона"
              onFocus={IS_WEB ? onWebInputFocus : undefined}
            />
            <View style={styles.step1BtnWrap}>
              <Pressable
                onPress={submitPhone}
                disabled={!phoneOk || sending}
                style={({ pressed }) => [
                  styles.btnPrimary,
                  (!phoneOk || sending) && styles.btnDisabled,
                  pressed && phoneOk && !sending && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Продолжить"
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.btnPrimaryText}>Продолжить</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.phaseLabel}>Шаг 2 — скопируйте код</Text>
            <Text style={styles.leadTitle}>Ваш код привязки</Text>
            <Text style={styles.subLead}>
              Нажмите «Скопировать код» — дальше он понадобится в WhatsApp.
            </Text>
            <View style={styles.codeBlock}>
              <Text style={styles.codeValue} selectable>
                {pairCode}
              </Text>
              <Pressable
                onPress={copyCode}
                style={({ pressed }) => [
                  styles.copyBtn,
                  pressed && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Скопировать код"
              >
                <Ionicons name="copy-outline" size={20} color="#fff" />
                <Text style={styles.copyBtnText}>Скопировать код</Text>
              </Pressable>
              {codeCopied ? (
                <View style={styles.copiedRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
                  <Text style={styles.copiedText}>Скопировано в буфер</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.step1BtnWrap}>
              <Pressable
                onPress={() => setStep(3)}
                style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Продолжить"
              >
                <Text style={styles.btnPrimaryText}>Продолжить</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </Pressable>
            </View>
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.phaseLabel}>Шаг 3 — WhatsApp</Text>
            <Text style={styles.leadTitle}>Вставьте код в WhatsApp</Text>
            <Text style={styles.subLead}>
              На номер <Text style={styles.phoneBold}>{displayPhone}</Text>{' '}
              придёт уведомление — <Text style={styles.emph}>нажмите на него</Text>
              , откроется поле для кода. Вставьте скопированный код и
              подтвердите привязку.
            </Text>
            <View style={styles.card}>
              <Ionicons name="link-outline" size={28} color="#25D366" />
              <Text style={styles.cardTitle}>Вставка кода</Text>
              <Text style={styles.cardText}>
                Долгое нажатие в поле кода → «Вставить». Затем нажмите «Я ввёл
                код в WhatsApp» внизу экрана.
              </Text>
            </View>
            {Platform.OS !== 'web' ? (
              <Pressable
                onPress={openWhatsApp}
                style={styles.linkWa}
                accessibilityRole="button"
                accessibilityLabel="Открыть WhatsApp"
              >
                <Ionicons name="logo-whatsapp" size={22} color="#25D366" />
                <Text style={styles.linkWaText}>Открыть WhatsApp</Text>
              </Pressable>
            ) : (
              <Text style={styles.webHint}>
                На телефоне откройте WhatsApp и проверьте уведомления.
              </Text>
            )}
            <View style={styles.hintCard}>
              <Ionicons name="checkmark-circle-outline" size={24} color="#3B82F6" />
              <Text style={styles.hintText}>
                Если уведомления не было, проверьте номер и начните с шага 1.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {step === 3 ? (
        <View
          style={[
            styles.footer,
            stickFooter && [
              styles.footerSticky,
              { bottom: keyboardHeight },
            ],
          ]}
        >
          <Pressable
            onPress={onSuccess}
            style={({ pressed }) => [styles.btnWa, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Я ввёл код в WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={22} color="#fff" />
            <Text style={styles.btnWaText}>Я ввёл код в WhatsApp</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );

  if (IS_WEB) {
    return (
      <div ref={webShellRef} style={webShellStyle}>
        {body}
      </div>
    );
  }

  return (
    <View style={styles.root}>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topBar: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'web' ? 8 : 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E5E7EB',
  },
  dotActive: {
    backgroundColor: '#25D366',
    width: 22,
    borderRadius: 4,
  },
  closeBtn: {
    padding: 8,
  },
  scroll: {
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    padding: 24,
    paddingBottom: 32,
  },
  scrollContentWithStickyFooter: {
    paddingBottom: 120,
  },
  scrollContentStep1: {
    paddingBottom: 48,
    flexGrow: 1,
  },
  step1BtnWrap: {
    marginTop: 28,
    marginBottom: 8,
  },
  phaseLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#25D366',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  leadTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    lineHeight: 30,
    marginBottom: 10,
  },
  subLead: {
    fontSize: 16,
    lineHeight: 24,
    color: '#6B7280',
    marginBottom: 24,
  },
  phoneBold: {
    fontWeight: '700',
    color: '#111827',
  },
  emph: {
    fontWeight: '700',
    color: '#111827',
  },
  codeBlock: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    padding: 20,
    marginBottom: 24,
    alignItems: 'center',
  },
  codeValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    color: '#111827',
    marginBottom: 16,
    fontVariant: ['tabular-nums'],
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#111827',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: '100%',
    maxWidth: 320,
  },
  copyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  copiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  copiedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#16A34A',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    backgroundColor: '#FAFAFA',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  card: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
    marginBottom: 8,
  },
  cardText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4B5563',
    textAlign: 'center',
  },
  linkWa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  linkWaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#25D366',
  },
  webHint: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  hintCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
  },
  hintText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#1E40AF',
  },
  footer: {
    flexShrink: 0,
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : IS_WEB ? 8 : 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  footerSticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingBottom: Platform.OS === 'ios' ? 14 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 12,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#3B82F6',
    borderRadius: 16,
    paddingVertical: 17,
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnWa: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#25D366',
    borderRadius: 16,
    paddingVertical: 17,
  },
  btnPressed: {
    opacity: 0.92,
  },
  btnPrimaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  btnWaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
});
