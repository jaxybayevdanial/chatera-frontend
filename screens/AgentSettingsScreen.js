import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_STAGES = [
  { id: '1', title: 'Приветствие' },
  { id: '2', title: 'Консультация' },
  { id: '3', title: 'Оформление заказа' },
  { id: '4', title: 'Завершение' },
];

function buildDefaultInstruction(username) {
  return (
    `Ты — AI-менеджер компании «@${username || 'business'}» в WhatsApp. ` +
    'Твоя главная задача — помогать клиентам получить информацию о товарах и услугах, ' +
    'оформить заказ и ответить на частые вопросы.'
  );
}

function StageRow({ stage, onMenu }) {
  return (
    <View style={styles.stageRow}>
      <Text style={styles.stageTitle}>{stage.title}</Text>
      <Pressable
        onPress={() => onMenu(stage)}
        style={styles.stageMenuBtn}
        accessibilityRole="button"
        accessibilityLabel={`Меню для ${stage.title}`}
        hitSlop={8}
      >
        <Ionicons name="ellipsis-vertical" size={20} color="#9CA3AF" />
      </Pressable>
    </View>
  );
}

let pickDocumentAsync = null;
try {
  const DocumentPicker = require('expo-document-picker');
  pickDocumentAsync = DocumentPicker.getDocumentAsync;
} catch (_) {
  // expo-document-picker not installed
}

function KnowledgeItem({ item, onRemove }) {
  const isFile = item.type === 'file';
  return (
    <View style={styles.kbItem}>
      <View style={styles.kbItemIcon}>
        <Ionicons
          name={isFile ? 'document-text-outline' : 'reader-outline'}
          size={20}
          color="#6B7280"
        />
      </View>
      <View style={styles.kbItemBody}>
        <Text style={styles.kbItemTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.kbItemMeta}>
          {isFile ? item.fileSize : `${item.text.length} симв.`}
        </Text>
      </View>
      <Pressable
        onPress={() => onRemove(item.id)}
        style={styles.kbItemRemove}
        accessibilityRole="button"
        accessibilityLabel="Удалить"
        hitSlop={8}
      >
        <Ionicons name="close-circle" size={20} color="#D1D5DB" />
      </Pressable>
    </View>
  );
}

export default function AgentSettingsScreen({ account }) {
  const [instruction, setInstruction] = useState(
    buildDefaultInstruction(account?.username)
  );
  const [stages] = useState(DEFAULT_STAGES);
  const [expandedInstruction, setExpandedInstruction] = useState(false);
  const inputRef = useRef(null);

  const [kbItems, setKbItems] = useState([]);
  const [kbTextModal, setKbTextModal] = useState(false);
  const [kbDraftTitle, setKbDraftTitle] = useState('');
  const [kbDraftText, setKbDraftText] = useState('');

  const addTextEntry = useCallback(() => {
    const title = kbDraftTitle.trim() || 'Без названия';
    const text = kbDraftText.trim();
    if (!text) return;
    setKbItems((prev) => [
      ...prev,
      { id: String(Date.now()), type: 'text', title, text },
    ]);
    setKbDraftTitle('');
    setKbDraftText('');
    setKbTextModal(false);
  }, [kbDraftTitle, kbDraftText]);

  const handlePickFile = useCallback(async () => {
    if (!pickDocumentAsync) {
      Alert.alert(
        'Недоступно',
        'Установите expo-document-picker для загрузки файлов.',
      );
      return;
    }
    try {
      const result = await pickDocumentAsync({
        type: ['application/pdf', 'text/*', 'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0] ?? result;
      const sizeKb = asset.size ? `${Math.round(asset.size / 1024)} КБ` : '';
      setKbItems((prev) => [
        ...prev,
        {
          id: String(Date.now()),
          type: 'file',
          title: asset.name || 'file',
          uri: asset.uri,
          fileSize: sizeKb,
        },
      ]);
    } catch {
      Alert.alert('Ошибка', 'Не удалось выбрать файл.');
    }
  }, []);

  const removeKbItem = useCallback((id) => {
    setKbItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS === 'ios'}
    >
      <ScrollView
        style={styles.scrollFlex}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Общая (Инструкция) ── */}
        <Text style={styles.sectionLabel}>Общая</Text>
        <View style={styles.card}>
          <TextInput
            ref={inputRef}
            style={styles.instructionInput}
            value={instruction}
            onChangeText={setInstruction}
            multiline
            scrollEnabled={false}
            textAlignVertical="top"
            accessibilityLabel="Инструкция агента"
          />
          <Pressable
            onPress={() => setExpandedInstruction(true)}
            style={({ pressed }) => [
              styles.viewFullInstructionBtn,
              pressed && styles.viewFullInstructionBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Посмотреть всю инструкцию"
          >
            <Ionicons name="reader-outline" size={21} color="#1D4ED8" />
            <Text style={styles.viewFullInstructionText}>
              Посмотреть всю инструкцию
            </Text>
          </Pressable>
        </View>

        {/* ── Этапы ── */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Этапы</Text>

        {stages.map((stage) => (
          <View key={stage.id} style={styles.stageCard}>
            <StageRow stage={stage} onMenu={() => {}} />
          </View>
        ))}

        {/* ── База знаний (RAG) ── */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
          База знаний
        </Text>
        <View style={styles.card}>
          {kbItems.length === 0 ? (
            <View style={styles.kbEmpty}>
              <Ionicons name="library-outline" size={32} color="#D1D5DB" />
              <Text style={styles.kbEmptyText}>
                Добавьте тексты или файлы — агент будет использовать их для ответов клиентам
              </Text>
            </View>
          ) : (
            <View style={styles.kbList}>
              {kbItems.map((item) => (
                <KnowledgeItem
                  key={item.id}
                  item={item}
                  onRemove={removeKbItem}
                />
              ))}
            </View>
          )}

          <View style={styles.kbActions}>
            <Pressable
              style={styles.kbActionBtn}
              onPress={() => setKbTextModal(true)}
              accessibilityRole="button"
              accessibilityLabel="Добавить текст"
            >
              <Ionicons name="create-outline" size={18} color="#3B82F6" />
              <Text style={styles.kbActionText}>Добавить текст</Text>
            </Pressable>

            <View style={styles.kbActionDivider} />

            <Pressable
              style={styles.kbActionBtn}
              onPress={handlePickFile}
              accessibilityRole="button"
              accessibilityLabel="Загрузить файл"
            >
              <Ionicons name="cloud-upload-outline" size={18} color="#3B82F6" />
              <Text style={styles.kbActionText}>Загрузить файл</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      <KbTextModal
        visible={kbTextModal}
        onClose={() => setKbTextModal(false)}
        kbDraftTitle={kbDraftTitle}
        setKbDraftTitle={setKbDraftTitle}
        kbDraftText={kbDraftText}
        setKbDraftText={setKbDraftText}
        onSave={addTextEntry}
      />

      <InstructionModal
        visible={expandedInstruction}
        onClose={() => setExpandedInstruction(false)}
        instruction={instruction}
        onChangeInstruction={setInstruction}
      />
    </KeyboardAvoidingView>
  );
}

function InstructionModal({ visible, onClose, instruction, onChangeInstruction }) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        enabled={Platform.OS !== 'web'}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Инструкция</Text>
            <Pressable
              onPress={onClose}
              style={styles.modalCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
            >
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          </View>
          <TextInput
            style={styles.modalInput}
            value={instruction}
            onChangeText={onChangeInstruction}
            multiline
            textAlignVertical="top"
            autoFocus
            accessibilityLabel="Редактирование инструкции"
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function KbTextModal({
  visible,
  onClose,
  kbDraftTitle,
  setKbDraftTitle,
  kbDraftText,
  setKbDraftText,
  onSave,
}) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible || Platform.OS === 'web') {
      setKeyboardHeight(0);
      return undefined;
    }
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
  }, [visible]);

  const stickSave = Platform.OS !== 'web' && keyboardHeight > 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalKbRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Новая запись</Text>
          <Pressable
            onPress={onClose}
            style={styles.modalCloseBtn}
            accessibilityRole="button"
            accessibilityLabel="Закрыть"
          >
            <Ionicons name="close" size={24} color="#111827" />
          </Pressable>
        </View>

        <ScrollView
          style={styles.kbModalScroll}
          contentContainerStyle={[
            styles.kbModalScrollContent,
            stickSave && { paddingBottom: 88 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            style={styles.kbModalTitleInput}
            value={kbDraftTitle}
            onChangeText={setKbDraftTitle}
            placeholder="Название (необязательно)"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Название записи"
          />
          <TextInput
            style={styles.kbModalTextInputScroll}
            value={kbDraftText}
            onChangeText={setKbDraftText}
            placeholder="Вставьте текст…"
            placeholderTextColor="#9CA3AF"
            multiline
            textAlignVertical="top"
            autoFocus
            accessibilityLabel="Текст записи"
          />
        </ScrollView>

        <View
          style={[
            styles.kbModalSaveWrap,
            stickSave && [
              styles.kbModalSaveSticky,
              { bottom: keyboardHeight },
            ],
          ]}
        >
          <Pressable
            style={[
              styles.kbModalSaveBtn,
              !kbDraftText.trim() && styles.kbModalSaveBtnDisabled,
            ]}
            onPress={onSave}
            disabled={!kbDraftText.trim()}
            accessibilityRole="button"
            accessibilityLabel="Сохранить запись"
          >
            <Text
              style={[
                styles.kbModalSaveText,
                !kbDraftText.trim() && styles.kbModalSaveTextDisabled,
              ]}
            >
              Сохранить
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  scrollFlex: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  /* Section */
  sectionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 8,
    marginLeft: 4,
  },
  /* Instruction card */
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  instructionInput: {
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    minHeight: 80,
    padding: 0,
    marginBottom: 4,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  viewFullInstructionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    width: '100%',
    borderRadius: 12,
    backgroundColor: 'rgba(37, 99, 235, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.18)',
  },
  viewFullInstructionBtnPressed: {
    backgroundColor: 'rgba(37, 99, 235, 0.16)',
    borderColor: 'rgba(37, 99, 235, 0.28)',
  },
  viewFullInstructionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  /* Stage cards */
  stageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  stageTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  stageMenuBtn: {
    padding: 4,
  },

  /* Knowledge base */
  kbEmpty: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  kbEmptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },
  kbList: {
    gap: 2,
  },
  kbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  kbItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  kbItemBody: {
    flex: 1,
    minWidth: 0,
  },
  kbItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  kbItemMeta: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  kbItemRemove: {
    padding: 4,
    marginLeft: 8,
  },
  kbActions: {
    flexDirection: 'row',
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  kbActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  kbActionDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  kbActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },

  modalRoot: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  modalKbRoot: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: Platform.OS === 'web' ? 24 : 56,
  },
  /* Modals (shared) */
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
  modalInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    padding: 16,
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },

  kbModalScroll: {
    flex: 1,
    minHeight: 0,
  },
  kbModalScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  kbModalTextInputScroll: {
    minHeight: 200,
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    textAlignVertical: 'top',
    padding: 0,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  kbModalSaveWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  kbModalSaveSticky: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 20,
  },
  /* KB text modal (legacy layout) */
  kbModalBody: {
    flex: 1,
    padding: 16,
  },
  kbModalTitleInput: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 12,
    marginBottom: 12,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  kbModalTextInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    color: '#111827',
    textAlignVertical: 'top',
    padding: 0,
    ...(Platform.OS === 'web' && { outlineStyle: 'none' }),
  },
  kbModalSaveBtn: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  kbModalSaveBtnDisabled: {
    backgroundColor: '#E5E7EB',
  },
  kbModalSaveText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  kbModalSaveTextDisabled: {
    color: '#9CA3AF',
  },
});
