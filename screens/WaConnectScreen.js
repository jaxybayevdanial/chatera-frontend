import React, {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
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
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';
import {
  fetchSession,
  getBotIdFromSession,
  fetchAuthMe,
  linkBotWhatsApp,
  errorMeansRegistrationRequired,
} from '../api/chatera';
import RegisterAccountModal from '../components/RegisterAccountModal';

function digitsOnly(s) {
  return (s || '').replace(/\D/g, '');
}

function sanitizePhoneInput(value) {
  const s = String(value ?? '');
  const digits = digitsOnly(s);
  if (!digits) return '';
  // E.164 max length is 15 digits (excluding plus).
  return `+${digits.slice(0, 15)}`;
}

/** Код привязки как value: первые 4 символа + «-» + остаток (буквы/цифры). */
function formatPairCodeValue(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const alnum = s.replace(/[^a-zA-Z0-9]/g, '');
  if (alnum.length === 0) return s;
  const first = alnum.slice(0, 4);
  const rest = alnum.slice(4);
  return rest.length ? `${first}-${rest}` : first;
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

const LINK_WAIT_TIPS = [
  'Запрос обрабатывается на стороне WhatsApp — обычно это 1–2 минуты. Всё идёт по плану.',
  'Можно ненадолго свернуть экран: когда сервис ответит, вы автоматически перейдёте к коду.',
  'Проверьте: на этом номере установлен WhatsApp и есть стабильный интернет.',
  'Подключение идёт через официальный канал интеграции — пароль от аккаунта не нужен.',
  'Если ждёте дольше 2 минут — нажмите «Отменить» и попробуйте снова чуть позже.',
];

function WaLinkWaitPulse() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.12,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [scale]);
  return (
    <Animated.View style={[styles.waWaitIconRing, { transform: [{ scale }] }]}>
      <View style={styles.waWaitIconInner}>
        <Ionicons name="logo-whatsapp" size={44} color="#fff" />
      </View>
    </Animated.View>
  );
}

function WaLinkShimmerBar() {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(x, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(x, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [x]);
  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 260],
  });
  return (
    <View style={styles.waShimmerTrack}>
      <Animated.View style={[styles.waShimmerFill, { transform: [{ translateX }] }]} />
    </View>
  );
}

function WaLinkWaitView({ onCancel }) {
  const [tipIdx, setTipIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      setTipIdx((i) => (i + 1) % LINK_WAIT_TIPS.length);
    }, 6500);
    return () => clearInterval(iv);
  }, []);

  return (
    <View style={styles.waWaitRoot}>
      <Text style={styles.phaseLabel}>Шаг 1 — подождите</Text>
      <Text style={styles.waWaitTitle}>Связываем номер с WhatsApp</Text>
      <Text style={styles.waWaitLead}>
        Это занимает примерно{' '}
        <Text style={styles.waWaitLeadBold}>1–2 минуты</Text>. Не закрывайте
        экран, пока не появится код.
      </Text>

      <View style={styles.waWaitVisual}>
        <WaLinkWaitPulse />
        <WaLinkShimmerBar />
        <Text style={styles.waWaitHint} accessibilityLiveRegion="polite">
          {LINK_WAIT_TIPS[tipIdx]}
        </Text>
      </View>

      <Pressable
        onPress={onCancel}
        style={({ pressed }) => [
          styles.waWaitCancelBtn,
          pressed && styles.btnPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Отменить ожидание"
      >
        <Text style={styles.waWaitCancelText}>Отменить</Text>
      </Pressable>
    </View>
  );
}

function resetWaPageScroll() {
  if (typeof window === 'undefined') return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export default function WaConnectScreen({
  onClose,
  onSuccess,
  botId: botIdProp,
}) {
  const [step, setStep] = useState(1);
  const [phoneText, setPhoneText] = useState('+7');
  const [sending, setSending] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const webShellRef = useRef(null);
  const [botLoading, setBotLoading] = useState(true);
  const [resolvedBotId, setResolvedBotId] = useState(
    botIdProp != null && String(botIdProp) !== '' ? String(botIdProp) : null,
  );
  const [botResolveError, setBotResolveError] = useState('');
  const linkAbortRef = useRef(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [registerModalVisible, setRegisterModalVisible] = useState(false);

  const cancelLinkWait = useCallback(() => {
    linkAbortRef.current?.abort();
    setSending(false);
  }, []);

  useEffect(() => {
    if (botIdProp != null && String(botIdProp) !== '') {
      setResolvedBotId(String(botIdProp));
      setBotResolveError('');
      setBotLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setBotLoading(true);
      setBotResolveError('');
      try {
        const me = await fetchAuthMe();
        if (cancelled) return;
        const isAuthed = me?.ok === true && me?.user != null;
        if (!isAuthed) {
          setNeedsRegistration(true);
          setBotLoading(false);
          return;
        }
        setNeedsRegistration(false);
        const data = await fetchSession();
        if (cancelled) return;
        const id = getBotIdFromSession(data);
        setResolvedBotId(id);
        if (!id) {
          setBotResolveError(
            'Чтобы подключить WhatsApp, сначала создайте агента (выберите Instagram и дождитесь готовности).',
          );
        }
      } catch (e) {
        if (!cancelled) {
          if (errorMeansRegistrationRequired(e)) {
            setNeedsRegistration(true);
          } else {
            setBotResolveError('Не удалось загрузить сессию. Проверьте сеть и попробуйте снова.');
          }
        }
      } finally {
        if (!cancelled) setBotLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [botIdProp]);

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

  const normalizedPhone = useMemo(() => {
    return sanitizePhoneInput(phoneText);
  }, [phoneText]);

  const parsedPhone = useMemo(
    () => parsePhoneNumberFromString(normalizedPhone || ''),
    [normalizedPhone],
  );
  const phoneOk = Boolean(parsedPhone?.isValid()) && !!resolvedBotId;

  const submitPhone = useCallback(async () => {
    if (!parsedPhone?.isValid() || !resolvedBotId) return;
    const d = digitsOnly(parsedPhone.number || normalizedPhone);
    if (!d) return;
    Keyboard.dismiss();
    linkAbortRef.current?.abort();
    const ac = new AbortController();
    linkAbortRef.current = ac;
    setSending(true);
    setCodeCopied(false);
    try {
      const result = await linkBotWhatsApp(resolvedBotId, d, { signal: ac.signal });
      const code = result?.data?.code;
      if (code == null || String(code).trim() === '') {
        throw new Error('Сервер не вернул код привязки');
      }
      setPairCode(formatPairCodeValue(code));
      setStep(2);
    } catch (e) {
      if (e?.name === 'AbortError') {
        return;
      }
      if (errorMeansRegistrationRequired(e)) {
        setNeedsRegistration(true);
        setRegisterModalVisible(true);
        return;
      }
      let msg = e?.message || 'Не удалось начать привязку';
      if (e?.status === 403) {
        msg = 'Нет доступа к этому боту.';
      } else if (e?.status === 503) {
        msg = 'Свободных инстансов WhatsApp сейчас нет. Попробуйте позже.';
      }
      Alert.alert('WhatsApp', msg);
    } finally {
      linkAbortRef.current = null;
      setSending(false);
    }
  }, [parsedPhone, normalizedPhone, resolvedBotId]);

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

  const displayPhone = parsedPhone?.formatInternational?.() || formatPhoneDisplay(digitsOnly(phoneText));

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

  const blockingGate = botLoading ? (
    <View style={styles.gateWrap}>
      <ActivityIndicator size="large" color="#25D366" />
      <Text style={styles.gateText}>Проверяем агента…</Text>
    </View>
  ) : !resolvedBotId && !needsRegistration ? (
    <View style={styles.gateWrap}>
      <Ionicons name="alert-circle-outline" size={52} color="#DC2626" />
      <Text style={styles.gateErrorTitle}>Нельзя подключить WhatsApp</Text>
      <Text style={styles.gateErrorText}>{botResolveError}</Text>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.btnPrimary, pressed && styles.btnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Закрыть"
      >
        <Text style={styles.btnPrimaryText}>Закрыть</Text>
      </Pressable>
    </View>
  ) : null;

  const showRegGate = needsRegistration && !botLoading;

  const body = (
    <>
      <View style={styles.topBar}>
        {!showRegGate ? (
          <View style={styles.stepDots}>
            {[1, 2, 3].map((s) => (
              <View
                key={s}
                style={[styles.dot, step >= s && styles.dotActive]}
                accessibilityElementsHidden
              />
            ))}
          </View>
        ) : <View />}
        <Pressable
          onPress={onClose}
          style={styles.closeBtn}
          accessibilityRole="button"
          accessibilityLabel="Закрыть"
        >
          <Ionicons name="close" size={24} color="#111827" />
        </Pressable>
      </View>

      {showRegGate ? (
        <View style={styles.regGate}>
          <View style={styles.regGateIconWrap}>
            <Ionicons name="logo-whatsapp" size={36} color="#25D366" />
          </View>
          <Text style={styles.regGateTitle}>Подключение WhatsApp</Text>
          <Text style={styles.regGateText}>
            Чтобы привязать WhatsApp к агенту, сначала создайте аккаунт — это займёт меньше минуты.
          </Text>
          <View style={styles.regGateBannerWrap}>
            <Pressable
              onPress={() => setRegisterModalVisible(true)}
              style={({ pressed }) => [
                styles.createAccountBtn,
                pressed && styles.createAccountBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Создать аккаунт"
            >
              <Text style={styles.createAccountBtnText}>Создать аккаунт</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {blockingGate && !showRegGate ? (
        <View style={styles.gateScroll}>{blockingGate}</View>
      ) : null}

      {!blockingGate && !showRegGate ? (
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={[
          styles.scrollContent,
          (step === 1 || step === 2) && styles.scrollContentStep1,
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === 1 && sending ? (
          <WaLinkWaitView onCancel={cancelLinkWait} />
        ) : null}

        {step === 1 && !sending ? (
          <>
            <Text style={styles.phaseLabel}>Шаг 1 — номер</Text>
            <Text style={styles.leadTitle}>Введите номер WhatsApp</Text>
            <Text style={styles.subLead}>
              После «Продолжить» запрос к WhatsApp может идти до 1–2 минут — это
              нормально. Дальше вы получите код для вставки в приложение.
            </Text>
            <Text style={styles.inputLabel}>Телефон</Text>
            <TextInput
              style={styles.input}
              value={phoneText}
              onChangeText={(text) => {
                const normalized = sanitizePhoneInput(text);
                if (!normalized) {
                  setPhoneText('');
                  return;
                }
                const formatter = new AsYouType();
                const formatted = formatter.input(normalized);
                setPhoneText(formatted || normalized);
              }}
              placeholder="+7 900 000-00-00"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Номер телефона"
              onFocus={IS_WEB ? onWebInputFocus : undefined}
            />
            <View style={styles.step1BtnWrap}>
              <Pressable
                onPress={submitPhone}
                disabled={!phoneOk}
                style={({ pressed }) => [
                  styles.btnPrimary,
                  !phoneOk && styles.btnDisabled,
                  pressed && phoneOk && styles.btnPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Продолжить"
              >
                <Text style={styles.btnPrimaryText}>Продолжить</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : null}

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
            <Pressable
              onPress={onSuccess}
              style={({ pressed }) => [
                styles.btnWa,
                styles.step3SubmitBtn,
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Я ввёл код в WhatsApp"
            >
              <Ionicons name="logo-whatsapp" size={22} color="#fff" />
              <Text style={styles.btnWaText}>Я ввёл код в WhatsApp</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
      ) : null}

      <RegisterAccountModal
        visible={registerModalVisible}
        onClose={() => setRegisterModalVisible(false)}
        onRegistered={async () => {
          setRegisterModalVisible(false);
          setNeedsRegistration(false);
          try {
            const data = await fetchSession();
            const id = getBotIdFromSession(data);
            if (id) setResolvedBotId(id);
          } catch {
            /* session will be retried on next action */
          }
        }}
      />
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
  gateScroll: {
    flex: 1,
    minHeight: 220,
  },
  gateWrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  gateText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 4,
  },
  gateErrorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  gateErrorText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 4,
    maxWidth: 320,
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
  scrollContentStep1: {
    paddingBottom: 48,
    flexGrow: 1,
  },
  waWaitRoot: {
    paddingBottom: 24,
  },
  waWaitTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 6,
    lineHeight: 30,
  },
  waWaitLead: {
    fontSize: 16,
    lineHeight: 24,
    color: '#64748b',
    marginTop: 12,
  },
  waWaitLeadBold: {
    fontWeight: '700',
    color: '#0f766e',
  },
  waWaitVisual: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 8,
  },
  waWaitIconRing: {
    marginBottom: 28,
  },
  waWaitIconInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 10,
  },
  waShimmerTrack: {
    position: 'relative',
    width: '100%',
    maxWidth: 300,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 22,
    alignSelf: 'center',
  },
  waShimmerFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 120,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#25D366',
  },
  waWaitHint: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
    paddingHorizontal: 8,
    minHeight: 66,
  },
  waWaitChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 8,
    marginBottom: 24,
  },
  waWaitChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  waWaitChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  waWaitCancelBtn: {
    alignSelf: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
  },
  waWaitCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  regGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  regGateIconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  regGateTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 10,
  },
  regGateText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 320,
    marginBottom: 28,
  },
  regGateBannerWrap: {
    width: '100%',
    maxWidth: 360,
  },
  createAccountBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAccountBtnPressed: {
    backgroundColor: '#1D4ED8',
  },
  createAccountBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
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
    paddingHorizontal: 0,
    paddingVertical: 0,
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
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
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
  step3SubmitBtn: {
    marginTop: 22,
    marginBottom: 16,
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
