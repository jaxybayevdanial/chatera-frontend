import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

const WA = {
  headerBg: '#075E54',
  headerText: '#ffffff',
  headerSubtitle: 'rgba(255,255,255,0.85)',
  chatBg: '#efeae2',
  sentBubble: '#dcf8c6',
  receivedBubble: '#ffffff',
  bubbleText: '#111b21',
  inputRowBg: '#efeae2',
  inputBg: '#ffffff',
  sendButton: '#25D366',
  backIcon: '#ffffff',
  placeholder: '#667781',
};

const MOCK_MESSAGES = [
  { id: '1', text: 'Привет! Я ваш AI-менеджер. Чем могу помочь?', isUser: false },
  { id: '2', text: 'Расскажи про доставку', isUser: true },
  { id: '3', text: 'Доставка по городу — 1–2 дня. По области — до 3 дней. Стоимость от 300 ₽.', isUser: false },
];

const IS_WEB = Platform.OS === 'web';

function TypingDots() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setFrame((f) => (f + 1) % 4), 400);
    return () => clearInterval(iv);
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: '#90959a',
            opacity: (frame % 4) === i ? 1 : 0.4,
          }}
        />
      ))}
    </View>
  );
}

function resetPageScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

export default function ChatScreen({
  account,
  onBack,
  onConfigureAgent,
  onConnectWhatsApp,
}) {
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [inputText, setInputText] = useState('');
  const scrollRef = useRef(null);
  const containerRef = useRef(null);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  }, []);

  useEffect(() => {
    if (messages.length) scrollToEnd();
  }, [messages.length, scrollToEnd]);

  useEffect(() => {
    if (IS_WEB) return;
    const sub = Keyboard.addListener('keyboardDidShow', scrollToEnd);
    return () => sub.remove();
  }, [scrollToEnd]);

  // Web: lock page scroll, block touchmove outside message list, compensate visualViewport offset
  useEffect(() => {
    if (!IS_WEB) return;
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.cssText += `;overflow:hidden!important;height:100%!important;touch-action:none!important;overscroll-behavior:none!important;background-color:${WA.chatBg}!important;`;
    body.style.cssText += `;overflow:hidden!important;position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;height:100%!important;touch-action:none!important;overscroll-behavior:none!important;background-color:${WA.chatBg}!important;`;
    if (root) root.style.cssText += `;overflow:hidden!important;height:100%!important;touch-action:none!important;overscroll-behavior:none!important;background-color:${WA.chatBg}!important;`;

    const blockTouchMove = (e) => {
      let node = e.target;
      while (node && node !== document) {
        const style = window.getComputedStyle(node);
        if (
          (style.overflow === 'auto' || style.overflow === 'scroll' ||
           style.overflowY === 'auto' || style.overflowY === 'scroll') &&
          node.scrollHeight > node.clientHeight
        ) {
          return;
        }
        node = node.parentNode;
      }
      e.preventDefault();
    };
    document.addEventListener('touchmove', blockTouchMove, { passive: false });

    // Aggressively reset page scroll — iOS WebViews forcibly scroll on input focus
    const onPageScroll = () => resetPageScroll();
    window.addEventListener('scroll', onPageScroll, { passive: false });

    // Resize container to match visual viewport (keyboard-aware) and compensate scroll offset
    const vv = window.visualViewport;
    const syncContainerToViewport = () => {
      const el = containerRef.current;
      if (!el) return;

      const innerH = window.innerHeight;
      const vvH = vv ? Math.round(vv.height) : innerH;
      const vvTop = vv ? Math.round(vv.offsetTop) : 0;

      // Use visual viewport height if reasonable, otherwise innerHeight
      const h = vvH > 200 ? Math.min(vvH, innerH) : innerH;
      el.style.height = h + 'px';

      // If iOS scrolled the page to reveal the input, shift container into visible area
      if (vvTop > 0) {
        el.style.transform = `translateY(${vvTop}px)`;
      } else {
        el.style.transform = '';
      }

      resetPageScroll();
    };

    // Initial sync + listen for changes
    syncContainerToViewport();
    if (vv) {
      vv.addEventListener('resize', syncContainerToViewport);
      vv.addEventListener('scroll', syncContainerToViewport);
    }
    window.addEventListener('resize', syncContainerToViewport);

    return () => {
      document.removeEventListener('touchmove', blockTouchMove);
      window.removeEventListener('scroll', onPageScroll);
      window.removeEventListener('resize', syncContainerToViewport);
      if (vv) {
        vv.removeEventListener('resize', syncContainerToViewport);
        vv.removeEventListener('scroll', syncContainerToViewport);
      }
    };
  }, []);

  // On web input focus: aggressively reset page scroll over the keyboard animation period
  const handleInputFocus = useCallback(() => {
    scrollToEnd();
    if (!IS_WEB) return;
    resetPageScroll();
    // Fight iOS scroll animation for ~800ms — also re-sync container size as keyboard animates
    let count = 0;
    const iv = setInterval(() => {
      resetPageScroll();
      const el = containerRef.current;
      const vv = window.visualViewport;
      if (el && vv) {
        const innerH = window.innerHeight;
        const vvH = Math.round(vv.height);
        const h = vvH > 200 ? Math.min(vvH, innerH) : innerH;
        el.style.height = h + 'px';
        const vvTop = Math.round(vv.offsetTop);
        el.style.transform = vvTop > 0 ? `translateY(${vvTop}px)` : '';
      }
      count++;
      if (count >= 16) {
        clearInterval(iv);
        scrollToEnd();
      }
    }, 50);
  }, [scrollToEnd]);

  const sendMessage = () => {
    const t = inputText.trim();
    if (!t) return;
    const userMsgId = String(Date.now());
    const typingId = userMsgId + '_typing';
    setInputText('');
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, text: t, isUser: true },
      { id: typingId, isUser: false, isTyping: true },
    ]);
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? { ...m, isTyping: false, text: 'Сообщение получено. (Это mock-ответ.)' }
            : m
        )
      );
    }, 1200 + Math.random() * 800);
  };

  const headerBlock = (
    <View style={styles.header}>
      <Pressable
        onPress={onBack}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Назад к настройкам"
      >
        <Ionicons name="arrow-back" size={24} color={WA.backIcon} />
      </Pressable>
      {account?.profilePicUrl ? (
        <Image
          source={{ uri: account.profilePicUrl }}
          style={styles.headerAvatar}
          accessibilityRole="image"
          accessibilityLabel="Аватар"
        />
      ) : (
        <View style={styles.headerAvatarPlaceholder}>
          <Ionicons name="person" size={22} color="rgba(255,255,255,0.9)" />
        </View>
      )}
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Тестирование агента
        </Text>
        {account ? (
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            @{account.username}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const messageList = (
    <ScrollView
      ref={scrollRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {messages.map((msg) => (
        <View
          key={msg.id}
          style={[styles.bubbleWrap, msg.isUser ? styles.bubbleWrapUser : styles.bubbleWrapBot]}
        >
          <View style={[styles.bubble, msg.isUser ? styles.bubbleUser : styles.bubbleBot]}>
            {msg.isTyping ? (
              <TypingDots />
            ) : (
              <Text style={[styles.bubbleText, msg.isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
                {msg.text}
              </Text>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const quickActionsBar = (
    <View style={styles.quickActionsBar}>
      <Pressable
        onPress={onConfigureAgent}
        style={({ pressed }) => [
          styles.quickActionBtn,
          styles.quickActionBtnAgent,
          pressed && styles.quickActionBtnAgentPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Настроить агента"
      >
        <Ionicons name="settings-outline" size={18} color="#fff" />
        <Text style={styles.quickActionTextFilled} numberOfLines={1}>
          Настроить агента
        </Text>
      </Pressable>
      <Pressable
        onPress={onConnectWhatsApp}
        style={({ pressed }) => [
          styles.quickActionBtn,
          styles.quickActionBtnWaFilled,
          pressed && styles.quickActionBtnWaFilledPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Подключить WhatsApp"
      >
        <Ionicons name="logo-whatsapp" size={18} color="#fff" />
        <Text style={styles.quickActionTextFilled} numberOfLines={1}>
          Подключить
        </Text>
      </Pressable>
    </View>
  );

  const inputBlock = (
    <View style={styles.inputRow}>
      <TextInput
        style={styles.input}
        placeholder="Сообщение…"
        placeholderTextColor={WA.placeholder}
        value={inputText}
        onChangeText={setInputText}
        onSubmitEditing={sendMessage}
        onFocus={handleInputFocus}
        onKeyPress={(e) => {
          if (IS_WEB && e.nativeEvent.key === 'Enter' && !e.nativeEvent.shiftKey) {
            e.preventDefault();
            sendMessage();
          }
        }}
        returnKeyType="send"
        blurOnSubmit
        maxLength={2000}
        accessibilityLabel="Введите сообщение"
      />
      <Pressable
        onPress={sendMessage}
        style={({ pressed }) => [styles.sendBtn, pressed && styles.sendBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel="Отправить"
      >
        <Ionicons name="send" size={20} color="#fff" />
      </Pressable>
    </View>
  );

  if (IS_WEB) {
    return (
      <div
        ref={containerRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          touchAction: 'none',
          overscrollBehavior: 'none',
          backgroundColor: WA.chatBg,
        }}
      >
        <StatusBar style="light" />
        {headerBlock}
        {messageList}
        {quickActionsBar}
        {inputBlock}
      </div>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <StatusBar style="light" />
      {headerBlock}
      {messageList}
      {quickActionsBar}
      {inputBlock}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WA.chatBg,
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
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
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
    fontSize: 14,
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
      overscrollBehavior: 'contain',
      WebkitOverflowScrolling: 'touch',
    }),
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: WA.chatBg,
  },
  quickActionsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: WA.inputRowBg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    flexShrink: 0,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 0,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  quickActionBtnAgent: {
    backgroundColor: '#2563EB',
  },
  quickActionBtnAgentPressed: {
    backgroundColor: '#1D4ED8',
  },
  quickActionBtnWaFilled: {
    backgroundColor: '#25D366',
  },
  quickActionBtnWaFilledPressed: {
    backgroundColor: '#20BD5A',
  },
  quickActionTextFilled: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 18,
  },
  bubbleWrap: {
    alignSelf: 'flex-start',
    maxWidth: '85%',
    marginBottom: 10,
  },
  bubbleWrapUser: {
    alignSelf: 'flex-end',
  },
  bubble: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    maxWidth: '100%',
  },
  bubbleBot: {
    backgroundColor: WA.receivedBubble,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: WA.sentBubble,
    borderBottomRightRadius: 4,
  },
  bubbleText: {
    fontSize: 16,
    lineHeight: 22,
    color: WA.bubbleText,
  },
  bubbleTextBot: {
    color: WA.bubbleText,
  },
  bubbleTextUser: {
    color: WA.bubbleText,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 6,
    paddingBottom: Platform.OS === 'ios' ? 22 : 6,
    backgroundColor: WA.inputRowBg,
    gap: 8,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    height: 36,
    minHeight: 36,
    maxHeight: 120,
    fontSize: 16,
    color: WA.bubbleText,
    backgroundColor: WA.inputBg,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 8,
    paddingTop: 8,
    ...(IS_WEB && {
      outlineStyle: 'none',
      columnCount: 1,
      resize: 'none',
    }),
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WA.sendButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnPressed: {
    opacity: 0.9,
  },
});
