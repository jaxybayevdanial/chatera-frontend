import { useState, useCallback, useEffect, useRef } from 'react';
import {
  createSession,
  createInstagramBot,
  searchInstagramUsers,
  fetchSession,
  fetchBots,
  getBotIdFromSession,
  getBotPhoneNumberFromSession,
  isWhatsAppLinkedForBot,
  buildResumeAccountFromSession,
} from './api/chatera';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  Keyboard,
  Image,
  ActivityIndicator,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ChateraLogo from './components/ChateraLogo';
import CreateAgentScreen from './screens/CreateAgentScreen';
import ChatScreen from './screens/ChatScreen';
import MainTabsScreen from './screens/MainTabsScreen';
import WaConnectScreen from './screens/WaConnectScreen';

const DEBOUNCE_MS = 900;
const IS_WEB = Platform.OS === 'web';
/** Чуть быстрее, без лишних слоёв — только слайд */
const WEB_SLIDE_MS = 200;
const WEB_SLIDE_OUT_MS = 175;

/** Web: чат слайдом справа; close(after) — выезд, затем after?.(), onLayerClosed */
function WebChatSlideLayer({ width, onLayerClosed, children }) {
  const x = useRef(new Animated.Value(width)).current;

  useEffect(() => {
    const w = Math.max(width, 320);
    x.setValue(w);
    Animated.timing(x, {
      toValue: 0,
      duration: WEB_SLIDE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const wRef = useRef(Math.max(width, 320));
  wRef.current = Math.max(width, 320);

  const close = useCallback(
    (after) => {
      const w = wRef.current;
      Animated.timing(x, {
        toValue: w,
        duration: WEB_SLIDE_OUT_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) {
          after?.();
          onLayerClosed?.();
        }
      });
    },
    [x, onLayerClosed],
  );

  return (
    <Animated.View
      style={[
        styles.webChatLayer,
        {
          transform: [{ translateX: x }],
        },
      ]}
    >
      {children(close)}
    </Animated.View>
  );
}

function AvatarImage({ profilePicUrl, style }) {
  if (!profilePicUrl) {
    return (
      <View style={[style, styles.dropdownAvatarPlaceholder]} accessibilityElementsHidden>
        <Ionicons name="person" size={24} color="#9ca3af" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: profilePicUrl }}
      style={style}
      resizeMode="cover"
      accessibilityRole="image"
      accessibilityLabel="Аватар пользователя"
    />
  );
}

export default function App() {
  const { width: windowWidth } = useWindowDimensions();
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [viewState, setViewState] = useState('home');
  const [mainTabsMountId, setMainTabsMountId] = useState(0);
  const [mainStartTab, setMainStartTab] = useState('settings');
  /** Пока не ответил POST /api/session — чтобы не мигал экран выбора, если в куки уже есть агент */
  const [sessionBootReady, setSessionBootReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessionPayload = await createSession();
        if (
          !cancelled &&
          sessionPayload &&
          getBotIdFromSession(sessionPayload)
        ) {
          setSelectedAccount(buildResumeAccountFromSession(sessionPayload));
          setMainStartTab('settings');
          setViewState('main');
        }
      } catch {
        /* не блокируем UI */
      }
      try {
        if (!cancelled) await fetchBots();
      } catch {
        /* опционально */
      }
      if (!cancelled) setSessionBootReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [dialogsAutoOpenLinkModal, setDialogsAutoOpenLinkModal] = useState(false);
  const [webOverlayChatOpen, setWebOverlayChatOpen] = useState(false);
  /** Подключение WA поверх чата — без ухода на вкладку Диалоги */
  const [waConnectOverChat, setWaConnectOverChat] = useState(false);
  const [isWhatsAppLinked, setIsWhatsAppLinked] = useState(false);
  /** История тестового чата — живёт в App, чтобы не терялась при закрытии чата */
  const [testChatMessages, setTestChatMessages] = useState([]);

  const refreshWhatsAppLinked = useCallback(async () => {
    try {
      const session = await fetchSession();
      const fromSession = getBotPhoneNumberFromSession(session);
      if (fromSession) {
        setIsWhatsAppLinked(true);
        return;
      }
      const botsRes = await fetchBots();
      const firstBot =
        Array.isArray(botsRes?.bots) && botsRes.bots.length > 0
          ? botsRes.bots[0]
          : null;
      setIsWhatsAppLinked(isWhatsAppLinkedForBot(firstBot));
    } catch {
      /* ignore */
    }
  }, []);

  const openMain = useCallback((tab = 'settings', opts = {}) => {
    setMainStartTab(tab);
    setDialogsAutoOpenLinkModal(Boolean(opts.openWaLinkModal));
    setMainTabsMountId((n) => n + 1);
    setViewState('main');
  }, []);

  const clearDialogsAutoOpenLink = useCallback(() => {
    setDialogsAutoOpenLinkModal(false);
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const lastQueryRef = useRef('');

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setResults([]);
      setError(null);
      lastQueryRef.current = '';
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      (async () => {
        lastQueryRef.current = q;
        setLoading(true);
        setError(null);
        try {
          const list = await searchInstagramUsers(q);
          if (lastQueryRef.current === q) {
            setResults(list);
            setError(null);
          }
        } catch (e) {
          if (lastQueryRef.current === q) {
            setResults([]);
            setError(e?.message || 'Не удалось выполнить поиск');
          }
        } finally {
          if (lastQueryRef.current === q) {
            setLoading(false);
          }
        }
      })();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery]);

  const hasQuery = searchQuery.trim().length > 0;
  const showDropdown = (isFocused || hasQuery) && hasQuery;

  const handleSelectAccount = useCallback((account) => {
    setSearchQuery(account.username);
    Keyboard.dismiss();
    setSelectedAccount(account);
    setWaConnectOverChat(false);
    setTestChatMessages([]);
    setViewState('creating');
    createInstagramBot(account.username).catch(() => {});
  }, []);
  useEffect(() => {
    if (viewState === 'main' || viewState === 'chat') {
      refreshWhatsAppLinked();
    }
  }, [viewState, refreshWhatsAppLinked]);

  if (viewState === 'main' && selectedAccount) {
    if (IS_WEB) {
      return (
        <View style={styles.webMainChatHost}>
          <MainTabsScreen
            key={mainTabsMountId}
            account={selectedAccount}
            onTest={() => {
              setWaConnectOverChat(false);
              setWebOverlayChatOpen(true);
            }}
            initialTab={mainStartTab}
            dialogsAutoOpenLinkModal={dialogsAutoOpenLinkModal}
            onDialogsAutoOpenLinkConsumed={clearDialogsAutoOpenLink}
          />
          {webOverlayChatOpen ? (
            <WebChatSlideLayer
              width={windowWidth}
              onLayerClosed={() => {
                setWaConnectOverChat(false);
                setWebOverlayChatOpen(false);
              }}
            >
              {(close) => (
                <View style={styles.chatWaHost}>
                  <ChatScreen
                    account={selectedAccount}
                    messages={testChatMessages}
                    onMessagesChange={setTestChatMessages}
                    onBack={() => close()}
                    onConfigureAgent={() => close(() => openMain('settings'))}
                    onConnectWhatsApp={() => setWaConnectOverChat(true)}
                    showConnectWhatsApp={!isWhatsAppLinked}
                  />
                  {waConnectOverChat ? (
                    <View style={styles.waOverChat}>
                      <WaConnectScreen
                        onClose={() => setWaConnectOverChat(false)}
                        onSuccess={() => {
                          setWaConnectOverChat(false);
                          setIsWhatsAppLinked(true);
                          close(() => openMain('dialogs'));
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              )}
            </WebChatSlideLayer>
          ) : null}
        </View>
      );
    }
    return (
      <MainTabsScreen
        key={mainTabsMountId}
        account={selectedAccount}
        onTest={() => {
          setWaConnectOverChat(false);
          setViewState('chat');
        }}
        initialTab={mainStartTab}
        dialogsAutoOpenLinkModal={dialogsAutoOpenLinkModal}
        onDialogsAutoOpenLinkConsumed={clearDialogsAutoOpenLink}
      />
    );
  }

  if (viewState === 'chat' && selectedAccount) {
    if (IS_WEB) {
      return (
        <WebChatSlideLayer width={windowWidth} onLayerClosed={() => setWaConnectOverChat(false)}>
          {(close) => (
            <View style={styles.chatWaHost}>
              <ChatScreen
                account={selectedAccount}
                messages={testChatMessages}
                onMessagesChange={setTestChatMessages}
                onBack={() => close(() => openMain('settings'))}
                onConfigureAgent={() => close(() => openMain('settings'))}
                onConnectWhatsApp={() => setWaConnectOverChat(true)}
                showConnectWhatsApp={!isWhatsAppLinked}
              />
              {waConnectOverChat ? (
                <View style={styles.waOverChat}>
                  <WaConnectScreen
                    onClose={() => setWaConnectOverChat(false)}
                    onSuccess={() => {
                      setWaConnectOverChat(false);
                      setIsWhatsAppLinked(true);
                      close(() => openMain('dialogs'));
                    }}
                  />
                </View>
              ) : null}
            </View>
          )}
        </WebChatSlideLayer>
      );
    }
    return (
      <View style={styles.chatWaHost}>
        <ChatScreen
          account={selectedAccount}
          messages={testChatMessages}
          onMessagesChange={setTestChatMessages}
          onBack={() => openMain('settings')}
          onConfigureAgent={() => openMain('settings')}
          onConnectWhatsApp={() => setWaConnectOverChat(true)}
          showConnectWhatsApp={!isWhatsAppLinked}
        />
        {waConnectOverChat ? (
          <View style={styles.waOverChat}>
            <WaConnectScreen
              onClose={() => setWaConnectOverChat(false)}
              onSuccess={() => {
                setWaConnectOverChat(false);
                setIsWhatsAppLinked(true);
                openMain('dialogs');
              }}
            />
          </View>
        ) : null}
      </View>
    );
  }

  if (viewState === 'creating' && selectedAccount) {
    return (
      <CreateAgentScreen
        account={selectedAccount}
        onComplete={() => setViewState('chat')}
      />
    );
  }

  if (!sessionBootReady) {
    return (
      <View style={styles.container}>
        <StatusBar style="dark" />
        <LinearGradient
          colors={['#FFFFFF', '#E0F2FE', '#93C5FD', '#3B82F6']}
          locations={[0, 0.35, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.bootSplash}>
          <ChateraLogo width={48} style={styles.bootLogo} />
          <ActivityIndicator size="large" color="#2563EB" style={styles.bootSpinner} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <LinearGradient
        colors={['#FFFFFF', '#E0F2FE', '#93C5FD', '#3B82F6']}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.content}>
        <View style={styles.header} accessibilityRole="header">
          <View style={styles.logoRow}>
            <ChateraLogo width={36} style={styles.logoIcon} />
            <Text style={styles.logoText}>Chatera</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.title}>
            ИИ-чатбот для WhatsApp по вашему Instagram
          </Text>
          <Text style={styles.subtitle}>
            Введите ник — бот изучит ваш бизнес и начнёт отвечать клиентам в вашем стиле. Без кода, за пару минут.
          </Text>

          <View style={styles.searchWrapper}>
            <View style={[styles.searchBox, showDropdown && styles.searchBoxFocused]}>
              <TextInput
                style={styles.searchInput}
                placeholder="Введите ник Instagram…"
                placeholderTextColor="#9ca3af"
                value={searchQuery}
                onChangeText={setSearchQuery}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                returnKeyType="search"
                accessibilityLabel="Поиск по нику Instagram"
                accessibilityHint="Выберите аккаунт из списка результатов"
                autoComplete="username"
                spellCheck={false}
                autoCorrect={false}
              />
            </View>

            {showDropdown && (
              <View style={styles.dropdown} accessibilityLiveRegion="polite">
                <ScrollView
                  style={styles.dropdownScroll}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {loading && (
                    <View style={styles.dropdownLoading}>
                      <ActivityIndicator size="small" color="#3B82F6" />
                      <Text style={styles.dropdownLoadingText}>Поиск…</Text>
                    </View>
                  )}
                  {error && !loading && (
                    <View style={styles.dropdownError}>
                      <Text style={styles.dropdownErrorText}>{error}</Text>
                    </View>
                  )}
                  {!loading && !error && results.length === 0 && (
                    <View style={styles.dropdownEmpty}>
                      <Text style={styles.dropdownEmptyText}>Ничего не найдено</Text>
                    </View>
                  )}
                  {!loading && !error && results.length > 0 && results.map((account) => (
                    <Pressable
                      key={`${account.id}-${account.username}`}
                      style={({ pressed }) => [
                        styles.dropdownItem,
                        pressed && styles.dropdownItemPressed,
                      ]}
                      onPress={() => handleSelectAccount(account)}
                      accessibilityRole="button"
                      accessibilityLabel={`Выбрать аккаунт @${account.username}${account.fullName ? `, ${account.fullName}` : ''}`}
                    >
                      {account.profilePicUrl ? (
                        <AvatarImage profilePicUrl={account.profilePicUrl} style={styles.dropdownAvatar} />
                      ) : (
                        <View style={[styles.dropdownAvatar, styles.dropdownAvatarPlaceholder]}>
                          <Ionicons name="person" size={24} color="#9ca3af" />
                        </View>
                      )}
                      <View style={styles.dropdownItemText}>
                        <Text style={styles.dropdownUsername} numberOfLines={1}>
                          @{account.username}
                        </Text>
                        {account.fullName ? (
                          <Text style={styles.dropdownName} numberOfLines={1}>
                            {account.fullName}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webMainChatHost: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    ...(IS_WEB && { minHeight: '100vh' }),
  },
  webChatLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    ...(IS_WEB && { minHeight: '100vh' }),
  },
  chatWaHost: {
    flex: 1,
  },
  waOverChat: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
    zIndex: 50,
    elevation: 50,
  },
  container: {
    flex: 1,
  },
  bootSplash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootLogo: {
    marginBottom: 24,
  },
  bootSpinner: {
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 24 : 56,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 48,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    marginRight: 2,
  },
  logoText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
  },
  searchWrapper: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    marginTop: 32,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: 56,
    backgroundColor: '#fff',
    borderRadius: 9999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  searchBoxFocused: {
    borderColor: '#3B82F6',
    backgroundColor: '#fff',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    paddingVertical: 0,
    paddingHorizontal: 12,
    marginVertical: 0,
    borderRadius: 9999,
    minWidth: 0,
    ...(Platform.OS === 'web' && { outlineStyle: 'none', boxSizing: 'border-box' }),
  },
  dropdown: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    maxHeight: 240,
  },
  dropdownScroll: {
    maxHeight: 236,
  },
  dropdownLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  dropdownLoadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  dropdownError: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  dropdownErrorText: {
    fontSize: 14,
    color: '#dc2626',
  },
  dropdownEmpty: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  dropdownEmptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 12,
  },
  dropdownItemPressed: {
    backgroundColor: '#F9FAFB',
  },
  dropdownAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    overflow: 'hidden',
  },
  dropdownAvatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemText: {
    flex: 1,
    minWidth: 0,
  },
  dropdownUsername: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  dropdownName: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
});
