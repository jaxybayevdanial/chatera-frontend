import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  FlatList,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchSession,
  getBotIdFromSession,
  getBotPhoneNumberFromSession,
  fetchBots,
  getFirstBotIdFromBots,
  isWhatsAppLinkedForBot,
  fetchBotChats,
  errorMeansRegistrationRequired,
} from '../api/chatera';
import RegisterAccountModal from '../components/RegisterAccountModal';

function formatListTime(iso) {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday
    ? d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function dialogTitle(item) {
  const n =
    (typeof item?.chatName === 'string' && item.chatName.trim()) ||
    (typeof item?.senderName === 'string' && item.senderName.trim());
  if (n) return n;
  return item?.chatId != null ? String(item.chatId) : 'Чат';
}

function dialogInitial(name) {
  const c = (name || '?').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

export default function DialogsScreen({
  onOpenConnect,
  onOpenThread,
}) {
  const [botId, setBotId] = useState(null);
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [needsRegistration, setNeedsRegistration] = useState(false);
  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [isWhatsAppLinked, setIsWhatsAppLinked] = useState(false);
  const loadLock = useRef(false);
  const pageRef = useRef(1);

  const resolveBotId = useCallback(async () => {
    const session = await fetchSession();
    setIsWhatsAppLinked(Boolean(getBotPhoneNumberFromSession(session)));
    const fromSession = getBotIdFromSession(session);
    if (fromSession) return fromSession;
    const botsRes = await fetchBots();
    const firstBot =
      Array.isArray(botsRes?.bots) && botsRes.bots.length > 0
        ? botsRes.bots[0]
        : null;
    if (firstBot) setIsWhatsAppLinked(isWhatsAppLinkedForBot(firstBot));
    return getFirstBotIdFromBots(botsRes);
  }, []);

  const loadPage = useCallback(
    async (pageNum, { append } = { append: false }) => {
      const id = await resolveBotId();
      if (!id) {
        setNeedsRegistration(false);
        setError('Сначала создайте агента — бот не найден в сессии.');
        setItems([]);
        setHasMore(false);
        return;
      }
      setBotId(id);
      const res = await fetchBotChats(id, { page: pageNum, limit: 25 });
      const data = res?.data;
      const chunk = Array.isArray(data?.items) ? data.items : [];
      const more = Boolean(data?.hasMore);
      if (append) {
        setItems((prev) => [...prev, ...chunk]);
      } else {
        setItems(chunk);
      }
      setHasMore(more);
      pageRef.current = pageNum;
      setError(null);
      setNeedsRegistration(false);
    },
    [resolveBotId],
  );

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      await loadPage(1, { append: false });
    } catch (e) {
      if (errorMeansRegistrationRequired(e)) {
        setNeedsRegistration(true);
        setError(null);
      } else {
        setNeedsRegistration(false);
        setError(e?.message || 'Не удалось загрузить диалоги');
      }
      setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  useEffect(() => {
    loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPage(1, { append: false });
    } catch (e) {
      if (errorMeansRegistrationRequired(e)) {
        setNeedsRegistration(true);
        setError(null);
      } else {
        setNeedsRegistration(false);
        setError(e?.message || 'Не удалось обновить');
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore || refreshing || loadLock.current) return;
    loadLock.current = true;
    setLoadingMore(true);
    try {
      await loadPage(pageRef.current + 1, { append: true });
    } catch {
      /* тихо — можно повторить pull-to-refresh */
    } finally {
      setLoadingMore(false);
      loadLock.current = false;
    }
  }, [hasMore, loading, loadingMore, refreshing, loadPage]);

  const openChat = useCallback(
    (row) => {
      const id = botId || null;
      if (!id || !row?.chatId) return;
      onOpenThread?.({
        botId: id,
        chatId: String(row.chatId),
        title: dialogTitle(row),
      });
    },
    [botId, onOpenThread],
  );

  if (loading && items.length === 0 && !needsRegistration) {
    return (
      <View style={styles.centerWrap}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Загрузка диалогов…</Text>
      </View>
    );
  }

  if (error && !needsRegistration && items.length === 0) {
    return (
      <View style={styles.centerWrap}>
        <Ionicons name="alert-circle-outline" size={48} color="#DC2626" />
        <Text style={styles.errorText}>{error}</Text>
        <Pressable onPress={loadInitial} style={styles.retryBtn} accessibilityRole="button">
          <Text style={styles.retryBtnText}>Повторить</Text>
        </Pressable>
      </View>
    );
  }

  const renderItem = ({ item }) => {
    const name = dialogTitle(item);
    const t = formatListTime(item?.updatedAt || item?.createdAt);
    return (
      <Pressable
        onPress={() => openChat(item)}
        style={({ pressed }) => [styles.dialogRow, pressed && styles.dialogRowPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Диалог с ${name}`}
      >
        <View style={styles.dialogAvatar}>
          <Text style={styles.dialogAvatarText}>{dialogInitial(name)}</Text>
        </View>
        <View style={styles.dialogBody}>
          <View style={styles.dialogTopRow}>
            <Text style={styles.dialogName} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.dialogTime}>{t}</Text>
          </View>
          <View style={styles.badgesRow}>
            {item?.isManualMode ? (
              <View style={styles.badgeManual}>
                <Text style={styles.badgeManualText}>Вручную</Text>
              </View>
            ) : null}
            {item?.isWaitingManager ? (
              <View style={styles.badgeWait}>
                <Text style={styles.badgeWaitText}>Ждёт менеджера</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#D1D5DB" />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(it) => String(it?._id ?? it?.chatId)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.35}
        ListEmptyComponent={
          <View style={styles.centerWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color="#9CA3AF" />
            <Text style={styles.emptyListText}>
              {needsRegistration ? 'Диалоги пока недоступны' : 'Пока нет диалогов'}
            </Text>
            <Text style={styles.emptyListHint}>
              {needsRegistration
                ? 'Создайте аккаунт — и подлкючите ваш WhatsApp.'
                : 'Когда клиенты напишут в WhatsApp, переписки появятся здесь.'}
            </Text>
            {needsRegistration ? (
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
            ) : null}
            {!needsRegistration && !isWhatsAppLinked && onOpenConnect ? (
              <Pressable
                onPress={onOpenConnect}
                style={styles.connectBtnMuted}
                accessibilityRole="button"
                accessibilityLabel="Привязать или проверить WhatsApp"
              >
                <Ionicons name="logo-whatsapp" size={18} color="#fff" style={styles.connectBtnIcon} />
                <Text style={styles.connectBtnText}>Привязать WhatsApp</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator color="#2563EB" />
            </View>
          ) : null
        }
        contentContainerStyle={
          items.length === 0 ? styles.flatEmptyContent : styles.flatContent
        }
        showsVerticalScrollIndicator={false}
      />

      <RegisterAccountModal
        visible={registerModalVisible}
        onClose={() => setRegisterModalVisible(false)}
        onRegistered={() => {
          setRegisterModalVisible(false);
          setNeedsRegistration(false);
          loadInitial();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: '#6B7280',
  },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: '#B91C1C',
    textAlign: 'center',
  },
  createAccountBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 10,
    minWidth: 220,
  },
  createAccountBtnPressed: {
    backgroundColor: '#1D4ED8',
  },
  createAccountBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#2563EB',
    borderRadius: 12,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  flatContent: {
    paddingBottom: 24,
  },
  flatEmptyContent: {
    flexGrow: 1,
  },
  emptyListText: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '600',
    color: '#374151',
  },
  emptyListHint: {
    marginTop: 8,
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  footerLoader: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  connectBtnMuted: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: '#25D366',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  connectBtnIcon: {
    marginRight: 8,
  },
  connectBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  dialogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  dialogRowPressed: {
    backgroundColor: '#F9FAFB',
  },
  dialogAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dialogAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3B82F6',
  },
  dialogBody: {
    flex: 1,
    minWidth: 0,
  },
  dialogTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dialogName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  dialogTime: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  badgeManual: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginRight: 6,
    marginTop: 2,
  },
  badgeManualText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B45309',
  },
  badgeWait: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 2,
  },
  badgeWaitText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#B91C1C',
  },
});
