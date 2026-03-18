import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MOCK_DIALOGS = [
  { id: '1', name: 'Алексей К.', lastMessage: 'Здравствуйте, хотел узнать про доставку', time: '14:32', unread: 2 },
  { id: '2', name: 'Мария С.', lastMessage: 'Спасибо, заказ оформлен!', time: '13:10', unread: 0 },
  { id: '3', name: 'Иван П.', lastMessage: 'А можно примерить перед покупкой?', time: '12:45', unread: 1 },
  { id: '4', name: 'Елена В.', lastMessage: 'Подскажите, есть ли скидки?', time: 'Вчера', unread: 0 },
  { id: '5', name: 'Дмитрий Р.', lastMessage: 'Когда будет доступен этот товар?', time: 'Вчера', unread: 0 },
];

export default function DialogsScreen({ waConnected, onOpenConnect }) {
  if (!waConnected) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="logo-whatsapp" size={48} color="#25D366" />
          </View>
          <Text style={styles.emptyTitle}>Подключите WhatsApp</Text>
          <Text style={styles.emptyDescription}>
            Привяжите номер, чтобы AI-менеджер начал отвечать клиентам. Все диалоги появятся здесь.
          </Text>
          <Pressable
            onPress={onOpenConnect}
            style={styles.connectBtn}
            accessibilityRole="button"
            accessibilityLabel="Привязать WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={styles.connectBtnText}>Привязать WhatsApp</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {MOCK_DIALOGS.map((dialog) => (
          <Pressable
            key={dialog.id}
            style={({ pressed }) => [
              styles.dialogRow,
              pressed && styles.dialogRowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Диалог с ${dialog.name}`}
          >
            <View style={styles.dialogAvatar}>
              <Text style={styles.dialogAvatarText}>
                {dialog.name.charAt(0)}
              </Text>
            </View>
            <View style={styles.dialogBody}>
              <View style={styles.dialogTopRow}>
                <Text style={styles.dialogName} numberOfLines={1}>
                  {dialog.name}
                </Text>
                <Text style={styles.dialogTime}>{dialog.time}</Text>
              </View>
              <View style={styles.dialogBottomRow}>
                <Text style={styles.dialogMessage} numberOfLines={1}>
                  {dialog.lastMessage}
                </Text>
                {dialog.unread > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{dialog.unread}</Text>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 15,
    lineHeight: 22,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 28,
    maxWidth: 300,
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#25D366',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 28,
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
  dialogBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dialogMessage: {
    fontSize: 14,
    color: '#6B7280',
    flex: 1,
    marginRight: 8,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
});
