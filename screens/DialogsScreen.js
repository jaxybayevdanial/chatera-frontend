import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MOCK_DIALOGS = [
  { id: '1', name: 'Алексей К.', lastMessage: 'Здравствуйте, хотел узнать про доставку', time: '14:32', unread: 2 },
  { id: '2', name: 'Мария С.', lastMessage: 'Спасибо, заказ оформлен!', time: '13:10', unread: 0 },
  { id: '3', name: 'Иван П.', lastMessage: 'А можно примерить перед покупкой?', time: '12:45', unread: 1 },
  { id: '4', name: 'Елена В.', lastMessage: 'Подскажите, есть ли скидки?', time: 'Вчера', unread: 0 },
  { id: '5', name: 'Дмитрий Р.', lastMessage: 'Когда будет доступен этот товар?', time: 'Вчера', unread: 0 },
];

export default function DialogsScreen({
  waConnected,
  onWaConnect,
  autoOpenLinkModal = false,
  onAutoOpenLinkConsumed,
}) {
  const [waLinkModal, setWaLinkModal] = useState(false);

  useEffect(() => {
    if (!autoOpenLinkModal || waConnected) return;
    setWaLinkModal(true);
    onAutoOpenLinkConsumed?.();
  }, [autoOpenLinkModal, waConnected, onAutoOpenLinkConsumed]);
  const [waCode] = useState(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let a = '', b = '';
    for (let i = 0; i < 4; i++) {
      a += chars[Math.floor(Math.random() * chars.length)];
      b += chars[Math.floor(Math.random() * chars.length)];
    }
    return `${a}\u2013${b}`;
  });

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
            onPress={() => setWaLinkModal(true)}
            style={styles.connectBtn}
            accessibilityRole="button"
            accessibilityLabel="Привязать WhatsApp"
          >
            <Ionicons name="logo-whatsapp" size={20} color="#fff" />
            <Text style={styles.connectBtnText}>Привязать WhatsApp</Text>
          </Pressable>
        </View>

        {/* WhatsApp linking modal */}
        <Modal
          visible={waLinkModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setWaLinkModal(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>WhatsApp</Text>
              <Pressable
                onPress={() => setWaLinkModal(false)}
                style={styles.modalCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Закрыть"
              >
                <Ionicons name="close" size={24} color="#111827" />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.waModalContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.waModalTitle}>
                Свяжите номер телефона, чтобы активировать AI-менеджера
              </Text>

              {[
                'Откройте WhatsApp на телефоне',
                'Перейдите в Настройки → Связанные устройства',
                'Нажмите «Привязать устройство»',
                'Введите код, показанный ниже',
              ].map((text, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{text}</Text>
                </View>
              ))}

              <View style={styles.codeCard}>
                <View style={styles.codeIconCircle}>
                  <Ionicons name="phone-portrait-outline" size={28} color="#3B82F6" />
                </View>
                <Text style={styles.codeLabel}>Код для привязки:</Text>
                <Text style={styles.codeValue} selectable>{waCode}</Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={() => {
                  onWaConnect();
                  setWaLinkModal(false);
                }}
                style={styles.confirmBtn}
                accessibilityRole="button"
                accessibilityLabel="Я ввёл код"
              >
                <Ionicons name="phone-portrait-outline" size={20} color="#fff" />
                <Text style={styles.confirmBtnText}>Я ввёл код</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
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

  /* Empty state (WA not connected) */
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

  /* Dialog list */
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

  /* WhatsApp linking modal */
  modalContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'web' ? 24 : 56,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalCloseBtn: {
    padding: 4,
  },
  waModalContent: {
    padding: 24,
    paddingBottom: 16,
  },
  waModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 28,
    marginBottom: 28,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 20,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3B82F6',
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    paddingTop: 4,
  },
  codeCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginTop: 12,
  },
  codeIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  codeLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  codeValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: 4,
  },
  modalFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 16,
  },
  confirmBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
});
