import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import AgentSettingsScreen from './AgentSettingsScreen';
import DialogsScreen from './DialogsScreen';
import WaConnectScreen from './WaConnectScreen';
import WaChatScreen from './WaChatScreen';

/** Только outline; активная вкладка — цвет + чуть больший размер, без filled-иконок */
const TABS = [
  { key: 'settings', label: 'Агент', icon: 'settings-outline' },
  { key: 'dialogs', label: 'Диалоги', icon: 'chatbubble-ellipses-outline' },
];

export default function MainTabsScreen({
  account,
  onTest,
  initialTab = 'settings',
  dialogsAutoOpenLinkModal = false,
  onDialogsAutoOpenLinkConsumed,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [waThread, setWaThread] = useState(null);
  const [waConnectOpen, setWaConnectOpen] = useState(
    () => Boolean(dialogsAutoOpenLinkModal),
  );

  useEffect(() => {
    if (dialogsAutoOpenLinkModal) {
      onDialogsAutoOpenLinkConsumed?.();
    }
  }, [dialogsAutoOpenLinkModal, onDialogsAutoOpenLinkConsumed]);

  const openWaConnect = useCallback(() => setWaConnectOpen(true), []);
  const closeWaConnect = useCallback(() => setWaConnectOpen(false), []);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {activeTab === 'settings' && 'Агент'}
          {activeTab === 'dialogs' &&
            (waConnectOpen ? 'Подключение WhatsApp' : 'Диалоги')}
        </Text>
        {activeTab === 'settings' && (
          <Pressable
            onPress={onTest}
            style={styles.testBtn}
            accessibilityRole="button"
            accessibilityLabel="Протестировать агента"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={17} color="#fff" />
            <Text style={styles.testBtnText}>Протестировать</Text>
          </Pressable>
        )}
        {activeTab === 'dialogs' && !waConnectOpen ? <View /> : null}
      </View>

      <View style={styles.content}>
        {activeTab === 'settings' && <AgentSettingsScreen account={account} />}
        {activeTab === 'dialogs' &&
          (waConnectOpen ? (
            <WaConnectScreen
              onClose={closeWaConnect}
              onSuccess={() => {
                closeWaConnect();
              }}
            />
          ) : (
            <DialogsScreen
              onOpenConnect={openWaConnect}
              onOpenThread={setWaThread}
            />
          ))}
      </View>

      {waThread ? (
        <View style={styles.waThreadOverlay} accessibilityViewIsModal>
          <WaChatScreen
            botId={waThread.botId}
            chatId={waThread.chatId}
            initialTitle={waThread.title}
            onBack={() => setWaThread(null)}
          />
        </View>
      ) : null}

      {/* Вариант: зелёная кнопка sticky над tab bar. Раскомментировать блок ниже
          и при желании убрать Pressable «Протестировать» из header выше.
      {activeTab === 'settings' && (
        <View style={styles.stickyTestBar}>
          <Pressable
            onPress={onTest}
            style={({ pressed }) => [
              styles.stickyTestBtn,
              pressed && styles.stickyTestBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Протестировать агента"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" />
            <Text style={styles.stickyTestBtnText}>Протестировать агента</Text>
          </Pressable>
        </View>
      )}
      */}

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.tabItem}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
            >
              <Ionicons
                name={tab.icon}
                size={24}
                color={active ? '#2563EB' : '#9CA3AF'}
              />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'web' ? 16 : 56,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  testBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  dialogsWaBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
  },
  content: {
    flex: 1,
  },
  waThreadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#efeae2',
    zIndex: 100,
    ...(Platform.OS === 'android' ? { elevation: 24 } : {}),
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 0 1px rgba(0,0,0,0.06)' }
      : {}),
  },
  stickyTestBar: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.06,
          shadowRadius: 4,
        }
      : Platform.OS === 'android'
        ? { elevation: 6 }
        : Platform.OS === 'web'
          ? { boxShadow: '0 -2px 12px rgba(0,0,0,0.06)' }
          : {}),
  },
  stickyTestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#16A34A',
    paddingVertical: 14,
    borderRadius: 12,
  },
  stickyTestBtnPressed: {
    backgroundColor: '#15803D',
  },
  stickyTestBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingBottom: Platform.OS === 'web' ? 8 : 28,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#2563EB',
  },
});
