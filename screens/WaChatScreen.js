import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchChat,
  fetchChatMessages,
  isOutgoingWaMessageType,
} from '../api/chatera';

const WA = {
  headerBg: '#075E54',
  headerText: '#ffffff',
  headerSubtitle: 'rgba(255,255,255,0.85)',
  chatBg: '#efeae2',
  sentBubble: '#dcf8c6',
  receivedBubble: '#ffffff',
  bubbleText: '#111b21',
  footerBarBg: '#efeae2',
  backIcon: '#ffffff',
  placeholder: '#667781',
};

const IS_WEB = Platform.OS === 'web';

function waTimestampToMs(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

function formatMessageTime(ts) {
  const ms = waTimestampToMs(ts);
  if (ms == null) return '';
  try {
    return new Date(ms).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function messageBody(m) {
  const text = typeof m?.textContent === 'string' ? m.textContent.trim() : '';
  if (text) return text;
  const kind = m?.typeMessage != null ? String(m.typeMessage) : 'сообщение';
  return `(${kind})`;
}

/**
 * @param {object} m raw API message
 * @returns {{ id: string, text: string, isOutgoing: boolean, timeLabel: string }}
 */
function mapApiMessage(m) {
  const id = String(m?._id ?? m?.idMessage ?? Math.random());
  const outgoing = isOutgoingWaMessageType(m?.type);
  return {
    id,
    text: messageBody(m),
    isOutgoing: outgoing,
    timeLabel: formatMessageTime(m?.timestamp),
  };
}

export default function WaChatScreen({
  botId,
  chatId,
  initialTitle,
  onBack,
}) {
  const [title, setTitle] = useState(initialTitle || chatId || 'Чат');
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);
  const loadOlderLock = useRef(false);
  /** Последняя загруженная страница API (1-based); сброс при refresh. */
  const maxPageLoadedRef = useRef(0);
  /** Не дергать подгрузку с верха сразу после mount (y === 0). */
  const canLoadOlderRef = useRef(false);

  const loadChatMeta = useCallback(async () => {
    if (!botId || !chatId) return;
    try {
      const res = await fetchChat(botId, chatId);
      const c = res?.chat;
      const name =
        (typeof c?.chatName === 'string' && c.chatName.trim()) ||
        (typeof c?.senderName === 'string' && c.senderName.trim()) ||
        initialTitle ||
        chatId;
      setTitle(name);
    } catch {
      /* заголовок из списка уже есть */
    }
  }, [botId, chatId, initialTitle]);

  const applyMessagesPage = useCallback((pageNum, items, dataHasMore) => {
    const batch = Array.isArray(items) ? items.slice().reverse().map(mapApiMessage) : [];
    if (pageNum <= 1) {
      setMessages(batch);
    } else {
      setMessages((prev) => [...batch, ...prev]);
    }
    setHasMore(Boolean(dataHasMore));
    maxPageLoadedRef.current = Math.max(maxPageLoadedRef.current, pageNum);
  }, []);

  const fetchPage = useCallback(
    async (pageNum) => {
      const res = await fetchChatMessages(botId, chatId, {
        page: pageNum,
        limit: 50,
      });
      const data = res?.data;
      applyMessagesPage(pageNum, data?.items, data?.hasMore);
    },
    [botId, chatId, applyMessagesPage],
  );

  const loadInitial = useCallback(async () => {
    if (!botId || !chatId) return;
    setError(null);
    setLoadingInitial(true);
    setHasMore(true);
    maxPageLoadedRef.current = 0;
    try {
      await loadChatMeta();
      await fetchPage(1);
    } catch (e) {
      setError(e?.message || 'Не удалось загрузить сообщения');
      setMessages([]);
    } finally {
      setLoadingInitial(false);
    }
  }, [botId, chatId, fetchPage, loadChatMeta]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadInitial();
    } finally {
      setRefreshing(false);
    }
  }, [loadInitial]);

  useEffect(() => {
    if (loadingInitial) {
      canLoadOlderRef.current = false;
      return undefined;
    }
    const t = setTimeout(() => {
      canLoadOlderRef.current = true;
    }, 500);
    return () => clearTimeout(t);
  }, [loadingInitial]);

  const loadOlder = useCallback(async () => {
    if (!hasMore || loadingOlder || loadingInitial || !botId || !chatId) return;
    if (loadOlderLock.current) return;
    loadOlderLock.current = true;
    setLoadingOlder(true);
    const nextPage = maxPageLoadedRef.current + 1;
    try {
      await fetchPage(nextPage);
    } catch (e) {
      Alert.alert('Чат', e?.message || 'Не удалось подгрузить историю');
    } finally {
      setLoadingOlder(false);
      loadOlderLock.current = false;
    }
  }, [hasMore, loadingOlder, loadingInitial, botId, chatId, fetchPage]);

  const onScroll = useCallback(
    (e) => {
      const y = e.nativeEvent.contentOffset.y;
      if (!canLoadOlderRef.current) return;
      if (y <= 48 && hasMore && !loadingOlder && !loadingInitial) {
        loadOlder();
      }
    },
    [hasMore, loadingOlder, loadingInitial, loadOlder],
  );

  const headerBlock = (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Назад к диалогам"
      >
        <Ionicons name="arrow-back" size={24} color={WA.backIcon} />
      </Pressable>
      <View style={styles.headerAvatarPlaceholder}>
        <Ionicons name="logo-whatsapp" size={22} color="rgba(255,255,255,0.95)" />
      </View>
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          WhatsApp · только просмотр
        </Text>
      </View>
    </View>
  );

  const listContent = loadingInitial ? (
    <View style={styles.centerBlock}>
      <ActivityIndicator size="large" color="#075E54" />
      <Text style={[styles.hintMuted, styles.centerBlockSpacing]}>Загрузка сообщений…</Text>
    </View>
  ) : error ? (
    <View style={styles.centerBlock}>
      <Ionicons name="cloud-offline-outline" size={48} color="#9CA3AF" />
      <Text style={[styles.errorText, styles.centerBlockSpacing]}>{error}</Text>
      <Pressable onPress={loadInitial} style={styles.retryBtn} accessibilityRole="button">
        <Text style={styles.retryBtnText}>Повторить</Text>
      </Pressable>
    </View>
  ) : messages.length === 0 ? (
    <View style={styles.centerBlock}>
      <Ionicons name="chatbubbles-outline" size={48} color="#9CA3AF" />
      <Text style={styles.hintMuted}>Сообщений пока нет</Text>
    </View>
  ) : (
    messages.map((msg) => (
      <View
        key={msg.id}
        style={[
          styles.bubbleWrap,
          msg.isOutgoing ? styles.bubbleWrapOutgoing : styles.bubbleWrapIncoming,
        ]}
      >
        <View
          style={[
            styles.bubble,
            msg.isOutgoing ? styles.bubbleOutgoing : styles.bubbleIncoming,
          ]}
        >
          <Text
            style={[
              styles.bubbleText,
              msg.isOutgoing ? styles.bubbleTextOutgoing : styles.bubbleTextIncoming,
            ]}
          >
            {msg.text}
          </Text>
          {msg.timeLabel ? (
            <Text style={styles.timeChip}>{msg.timeLabel}</Text>
          ) : null}
        </View>
      </View>
    ))
  );

  const scrollView = (
    <ScrollView
      ref={scrollRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={400}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#075E54" />
      }
    >
      {loadingOlder ? (
        <View style={styles.topLoader}>
          <View style={styles.topLoaderSpinner}>
            <ActivityIndicator size="small" color="#075E54" />
          </View>
          <Text style={styles.topLoaderText}>Ранние сообщения…</Text>
        </View>
      ) : null}
      {!hasMore && messages.length > 0 ? (
        <Text style={styles.historyStart}>Начало переписки</Text>
      ) : null}
      {listContent}
    </ScrollView>
  );

  const readOnlyFooter = (
    <View style={styles.readOnlyBar}>
      <View style={styles.readOnlyIcon}>
        <Ionicons name="eye-outline" size={18} color={WA.placeholder} />
      </View>
      <Text style={styles.readOnlyText}>
        Отправка сообщений из приложения недоступна — откройте WhatsApp для ответа клиенту.
      </Text>
    </View>
  );

  const body = (
    <>
      <StatusBar style="light" />
      {headerBlock}
      {scrollView}
      {readOnlyFooter}
    </>
  );

  if (IS_WEB) {
    return (
      <View style={styles.webRoot} accessibilityViewIsModal>
        {body}
      </View>
    );
  }

  return <View style={styles.container}>{body}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WA.chatBg,
  },
  webRoot: {
    flex: 1,
    backgroundColor: WA.chatBg,
    minHeight: 0,
    ...(IS_WEB && {
      height: '100%',
      width: '100%',
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingTop: IS_WEB ? 12 : 56,
    paddingBottom: 12,
    backgroundColor: WA.headerBg,
    flexShrink: 0,
  },
  backBtn: {
    padding: 8,
  },
  headerAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: WA.headerText,
  },
  headerSubtitle: {
    fontSize: 13,
    color: WA.headerSubtitle,
    marginTop: 2,
  },
  list: {
    flex: 1,
    minHeight: 0,
    backgroundColor: WA.chatBg,
    ...(IS_WEB && {
      overflow: 'auto',
      touchAction: 'pan-y',
    }),
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: WA.chatBg,
    flexGrow: 1,
  },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  centerBlockSpacing: {
    marginTop: 12,
  },
  hintMuted: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#B91C1C',
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#075E54',
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  topLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
  },
  topLoaderSpinner: {
    marginRight: 8,
  },
  topLoaderText: {
    fontSize: 13,
    color: '#6B7280',
  },
  historyStart: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  bubbleWrap: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    marginBottom: 10,
  },
  bubbleWrapIncoming: {
    alignSelf: 'flex-start',
  },
  bubbleWrapOutgoing: {
    alignSelf: 'flex-end',
  },
  bubble: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    maxWidth: '100%',
  },
  bubbleIncoming: {
    backgroundColor: WA.receivedBubble,
    borderBottomLeftRadius: 4,
  },
  bubbleOutgoing: {
    backgroundColor: WA.sentBubble,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
    color: WA.bubbleText,
  },
  bubbleTextIncoming: {
    color: WA.bubbleText,
  },
  bubbleTextOutgoing: {
    color: WA.bubbleText,
  },
  timeChip: {
    fontSize: 11,
    color: '#667781',
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  readOnlyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
    backgroundColor: WA.footerBarBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    flexShrink: 0,
  },
  readOnlyIcon: {
    marginRight: 10,
  },
  readOnlyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: WA.placeholder,
  },
});
