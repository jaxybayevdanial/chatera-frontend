import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchSession,
  parseBotSettingsFromSession,
  getBotIdFromSession,
  fetchBots,
  getFirstBotIdFromBots,
  fetchRagEntries,
  ragEntriesToKbItems,
  createRagEntry,
  deleteRagEntry,
  fetchAuthMe,
  patchBot,
  patchBotStagePrompt,
  isLikelyMongoObjectId,
} from '../api/chatera';
import RegisterAccountModal from '../components/RegisterAccountModal';

function formatAccountDate(iso) {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(+d)) return String(iso);
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function displayEmail(v) {
  if (v == null || v === '') return '—';
  return String(v);
}

/** Сортировка по полю order; этапы без order — в конце, порядок как в исходном массиве. */
function sortStagesByOrder(stages) {
  if (!Array.isArray(stages) || stages.length === 0) return [];
  return [...stages]
    .map((s, idx) => ({ s, idx }))
    .sort((a, b) => {
      const oa =
        typeof a.s.order === 'number' && !Number.isNaN(a.s.order)
          ? a.s.order
          : null;
      const ob =
        typeof b.s.order === 'number' && !Number.isNaN(b.s.order)
          ? b.s.order
          : null;
      if (oa != null && ob != null && oa !== ob) return oa - ob;
      if (oa != null && ob == null) return -1;
      if (oa == null && ob != null) return 1;
      return a.idx - b.idx;
    })
    .map(({ s }) => s);
}

/** Строка из allowedMoves → объект этапа (по id или названию). */
function resolveMoveToStage(moveLabel, allStages) {
  if (!Array.isArray(allStages) || allStages.length === 0) return null;
  const m = String(moveLabel ?? '').trim();
  if (!m) return null;
  const lower = m.toLowerCase();
  return (
    allStages.find((s) => String(s.id) === m) ||
    allStages.find((s) => String(s.title ?? '').trim() === m) ||
    allStages.find(
      (s) => String(s.title ?? '').trim().toLowerCase() === lower,
    ) ||
    null
  );
}

function displayOrderForStageInList(stage, sortedStages) {
  if (!stage) return null;
  const i = sortedStages.findIndex((s) => s.id === stage.id);
  if (i < 0) return null;
  const s = sortedStages[i];
  return typeof s.order === 'number' && !Number.isNaN(s.order) ? s.order : i + 1;
}

function uid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAllowedMoves(moves, stageIds) {
  if (!Array.isArray(moves)) return [];
  const valid = new Set(stageIds);
  const out = [];
  for (const m of moves) {
    const id = String(m ?? '').trim();
    if (!id || !valid.has(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function normalizeStagesForSave(stages) {
  if (!Array.isArray(stages)) return [];
  const withIds = stages.map((s, idx) => {
    const id = String(s?.id ?? '').trim() || `tmp_${idx}_${uid()}`;
    return {
      id,
      title: String(s?.title ?? '').trim() || `Этап ${idx + 1}`,
      prompt: typeof s?.prompt === 'string' ? s.prompt : '',
      order:
        typeof s?.order === 'number' && !Number.isNaN(s.order)
          ? s.order
          : idx + 1,
      allowedMoves: Array.isArray(s?.allowedMoves) ? s.allowedMoves : [],
    };
  });
  const ids = withIds.map((s) => s.id);
  return withIds.map((s) => ({
    ...s,
    allowedMoves: normalizeAllowedMoves(s.allowedMoves, ids).filter(
      (m) => m !== s.id,
    ),
  }));
}

function stageStructureSignature(stages) {
  const normalized = normalizeStagesForSave(stages).map((s) => ({
    id: s.id,
    title: s.title,
    order: s.order,
    allowedMoves: s.allowedMoves,
  }));
  return JSON.stringify(normalized);
}

const DEFAULT_STAGES = [
  { id: '1', title: 'Приветствие', prompt: '', allowedMoves: [], order: 1 },
  { id: '2', title: 'Консультация', prompt: '', allowedMoves: [], order: 2 },
  { id: '3', title: 'Оформление заказа', prompt: '', allowedMoves: [], order: 3 },
  { id: '4', title: 'Завершение', prompt: '', allowedMoves: [], order: 4 },
];

function buildDefaultInstruction(username) {
  return (
    `Ты — AI-менеджер компании «@${username || 'business'}» в WhatsApp. ` +
    'Твоя главная задача — помогать клиентам получить информацию о товарах и услугах, ' +
    'оформить заказ и ответить на частые вопросы.'
  );
}

function StageRow({ stage, displayOrder, onOpen }) {
  return (
    <Pressable
      onPress={() => onOpen?.(stage)}
      style={({ pressed }) => [
        styles.stageRow,
        pressed && styles.stageRowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Этап ${displayOrder}. ${stage.title}. Открыть данные`}
    >
      <View style={styles.stageOrderBadge} accessibilityElementsHidden>
        <Text style={styles.stageOrderBadgeText}>{displayOrder}</Text>
      </View>
      <Text style={styles.stageTitle}>{stage.title}</Text>
      <Ionicons name="chevron-forward" size={22} color="#9CA3AF" />
    </Pressable>
  );
}

function StageActions({ onCreate }) {
  return (
    <Pressable
      onPress={onCreate}
      style={({ pressed }) => [
        styles.createStageBtn,
        pressed && styles.createStageBtnPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel="Создать этап"
    >
      <Ionicons name="add-circle-outline" size={20} color="#1D4ED8" />
      <Text style={styles.createStageBtnText}>Создать этап</Text>
    </Pressable>
  );
}

let pickDocumentAsync = null;
try {
  const DocumentPicker = require('expo-document-picker');
  pickDocumentAsync = DocumentPicker.getDocumentAsync;
} catch (_) {
  // expo-document-picker not installed
}

function KnowledgeItem({ item, onRemove, onOpen }) {
  const isFile = item.type === 'file';
  const textLen = (item.text || '').length;
  return (
    <View style={styles.kbItem}>
      <Pressable
        onPress={() => onOpen?.(item)}
        style={({ pressed }) => [
          styles.kbItemPressable,
          pressed && styles.kbItemPressablePressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Открыть: ${item.title}`}
      >
        <View
          style={[
            styles.kbItemIcon,
            isFile ? styles.kbItemIconFile : styles.kbItemIconText,
          ]}
        >
          <Ionicons
            name={isFile ? 'document-text-outline' : 'reader-outline'}
            size={20}
            color={isFile ? '#B45309' : '#2563EB'}
          />
        </View>
        <View style={styles.kbItemBody}>
          <Text style={styles.kbItemTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.kbItemMeta}>
            {isFile ? `Файл${item.fileSize ? ` · ${item.fileSize}` : ''}` : item.kbMeta ?? `${textLen} символов`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#D1D5DB" style={styles.kbItemChevron} />
      </Pressable>
    </View>
  );
}

export default function AgentSettingsScreen({ account }) {
  const [instruction, setInstruction] = useState(() =>
    buildDefaultInstruction(account?.username)
  );
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [expandedInstruction, setExpandedInstruction] = useState(false);
  const inputRef = useRef(null);

  const [kbItems, setKbItems] = useState([]);
  /** Последний текст инструкции, уже отправленный на сервер (для авто-сохранения). */
  const lastInstructionPersistedRef = useRef('');
  const lastStageStructurePersistedRef = useRef(
    stageStructureSignature(DEFAULT_STAGES),
  );
  const instructionRef = useRef(instruction);
  instructionRef.current = instruction;

  useEffect(() => {
    const defaultInstr = buildDefaultInstruction(account?.username);
    setInstruction(defaultInstr);
    lastInstructionPersistedRef.current = defaultInstr.trim();
    setStages(DEFAULT_STAGES);
    lastStageStructurePersistedRef.current = stageStructureSignature(
      DEFAULT_STAGES,
    );
    setKbItems([]);
    setSessionBotId(null);
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchSession();
        if (cancelled || !data) return;
        const parsed = parseBotSettingsFromSession(data);
        let instr = defaultInstr;
        if (parsed?.instruction) instr = parsed.instruction;
        setInstruction(instr);
        lastInstructionPersistedRef.current = String(instr).trim();
        if (parsed?.stages?.length) {
          setStages(parsed.stages);
          lastStageStructurePersistedRef.current = stageStructureSignature(
            parsed.stages,
          );
        } else {
          lastStageStructurePersistedRef.current = stageStructureSignature(
            DEFAULT_STAGES,
          );
        }

        let botId = getBotIdFromSession(data);
        const botsPayload = await fetchBots();
        if (cancelled) return;
        if (botId == null || botId === '') {
          const fromList = getFirstBotIdFromBots(botsPayload);
          if (fromList) botId = fromList;
        }
        const botIdStr =
          botId != null && botId !== '' ? String(botId) : null;
        setSessionBotId(botIdStr);
        if (!botIdStr || cancelled) return;
        const rag = await fetchRagEntries(botIdStr);
        if (cancelled) return;
        setKbItems(ragEntriesToKbItems(rag?.entries ?? []));
      } catch {
        /* сеть / сессия — оставляем дефолты */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [account?.id, account?.username]);
  const [kbTextModal, setKbTextModal] = useState(false);
  const [kbDraftTitle, setKbDraftTitle] = useState('');
  const [kbDraftText, setKbDraftText] = useState('');
  const [kbSaving, setKbSaving] = useState(false);
  const [kbViewItem, setKbViewItem] = useState(null);
  const [stageViewStage, setStageViewStage] = useState(null);
  const [sessionBotId, setSessionBotId] = useState(null);

  const [meUser, setMeUser] = useState(null);
  const [meLoading, setMeLoading] = useState(true);
  const [registerModalVisible, setRegisterModalVisible] = useState(false);
  const [savingInstruction, setSavingInstruction] = useState(false);
  const [savingStages, setSavingStages] = useState(false);

  const loadMe = useCallback(async () => {
    setMeLoading(true);
    try {
      const r = await fetchAuthMe();
      if (r.ok && r.user) setMeUser(r.user);
      else setMeUser(null);
    } catch {
      setMeUser(null);
    } finally {
      setMeLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const openKbEntry = useCallback((item) => {
    setKbViewItem(item);
  }, []);

  const openStageDetail = useCallback((stage) => {
    setStageViewStage(stage);
  }, []);

  const sortedStages = useMemo(() => sortStagesByOrder(stages), [stages]);

  const canPersistBot = Boolean(meUser) && Boolean(sessionBotId);

  /** Авто-сохранение: PATCH /api/bots/:id, поле prompt (нужны botId + авторизация). */
  useEffect(() => {
    if (!sessionBotId || !meUser) return undefined;
    const trimmed = instruction.trim();
    if (!trimmed || trimmed === lastInstructionPersistedRef.current) {
      return undefined;
    }
    const handle = setTimeout(() => {
      const latest = instructionRef.current.trim();
      if (!latest || latest === lastInstructionPersistedRef.current) return;
      setSavingInstruction(true);
      (async () => {
        try {
          const r = await patchBot(sessionBotId, { prompt: latest });
          if (r.ok) {
            lastInstructionPersistedRef.current = latest;
            if (typeof r.data?.bot?.prompt === 'string') {
              setInstruction(r.data.bot.prompt);
              lastInstructionPersistedRef.current = String(
                r.data.bot.prompt,
              ).trim();
            }
          } else if (r.status === 401 || r.status === 403) {
            Alert.alert(
              'Нужна авторизация',
              'Инструкция не сохранилась: войдите в аккаунт в блоке «Аккаунт».',
            );
          }
        } catch {
          /* сеть — тихо, следующая пауза в наборе повторит */
        } finally {
          setSavingInstruction(false);
        }
      })();
    }, 1600);
    return () => clearTimeout(handle);
  }, [instruction, sessionBotId, meUser]);

  useEffect(() => {
    if (!sessionBotId || !meUser) return undefined;
    const signature = stageStructureSignature(stages);
    if (signature === lastStageStructurePersistedRef.current) return undefined;
    const handle = setTimeout(() => {
      const latest = normalizeStagesForSave(stages);
      const latestSig = stageStructureSignature(latest);
      if (latestSig === lastStageStructurePersistedRef.current) return;
      setSavingStages(true);
      (async () => {
        try {
          const r = await patchBot(sessionBotId, { stages: latest });
          if (r.ok) {
            lastStageStructurePersistedRef.current = latestSig;
          } else if (r.status === 401 || r.status === 403) {
            Alert.alert(
              'Нужна авторизация',
              'Изменения этапов не сохранились: войдите в аккаунт в блоке «Аккаунт».',
            );
          }
        } catch {
          /* сеть — повторим на следующем изменении */
        } finally {
          setSavingStages(false);
        }
      })();
    }, 900);
    return () => clearTimeout(handle);
  }, [stages, sessionBotId, meUser]);

  useEffect(() => {
    setStageViewStage((prev) => {
      if (!prev) return prev;
      const fresh = stages.find((s) => String(s.id) === String(prev.id));
      return fresh || null;
    });
  }, [stages]);

  const handleStagePromptSaved = useCallback((stageId, newPrompt) => {
    const p = typeof newPrompt === 'string' ? newPrompt : '';
    setStages((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, prompt: p } : s)),
    );
    setStageViewStage((prev) =>
      prev && prev.id === stageId ? { ...prev, prompt: p } : prev,
    );
  }, []);

  const createStage = useCallback(() => {
    const newId = `tmp_${uid()}`;
    let created = null;
    setStages((prev) => {
      const normalized = normalizeStagesForSave(prev);
      const nextOrder = normalized.length + 1;
      created = {
        id: newId,
        title: `Новый этап ${nextOrder}`,
        prompt: '',
        allowedMoves: [],
        order: nextOrder,
      };
      return [...normalized, created];
    });
    setStageViewStage({
      id: newId,
      title: created?.title || 'Новый этап',
      prompt: '',
      allowedMoves: [],
      order: created?.order || 1,
    });
  }, []);

  const deleteStage = useCallback((stageToDelete) => {
    const id = String(stageToDelete?.id ?? '');
    if (!id) return;
    setStages((prev) => {
      const filtered = prev.filter((s) => String(s.id) !== id);
      const ids = filtered.map((s) => String(s.id));
      return filtered.map((s, idx) => ({
        ...s,
        order: idx + 1,
        allowedMoves: normalizeAllowedMoves(s.allowedMoves, ids).filter(
          (m) => m !== id,
        ),
      }));
    });
    setStageViewStage((prev) =>
      prev && String(prev.id) === id ? null : prev,
    );
  }, []);

  const saveStageMeta = useCallback((stageId, patch) => {
    setStages((prev) =>
      prev.map((s) =>
        String(s.id) === String(stageId) ? { ...s, ...patch } : s,
      ),
    );
  }, []);

  const addTextEntry = useCallback(async () => {
    const title = kbDraftTitle.trim() || 'Без названия';
    const text = kbDraftText.trim();
    if (!text) return;
    if (!sessionBotId) {
      Alert.alert('Бот не найден', 'Сначала создайте или загрузите бота, затем добавьте запись.');
      return;
    }
    setKbSaving(true);
    try {
      await createRagEntry(sessionBotId, {
        title,
        content: text,
        type: 'text',
      });
      const rag = await fetchRagEntries(sessionBotId);
      setKbItems(ragEntriesToKbItems(rag?.entries ?? []));
      setKbDraftTitle('');
      setKbDraftText('');
      setKbTextModal(false);
    } catch (e) {
      Alert.alert('Ошибка', e?.message || 'Не удалось добавить запись в базу знаний.');
    } finally {
      setKbSaving(false);
    }
  }, [kbDraftTitle, kbDraftText, sessionBotId]);

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

  const removeKbItem = useCallback((item) => {
    if (item?.source !== 'rag') {
      setKbItems((prev) => prev.filter((i) => i.id !== item?.id));
      return;
    }
    if (!sessionBotId || !item?.ragEntryId) {
      setKbItems((prev) => prev.filter((i) => i.id !== item?.id));
      return;
    }
    Alert.alert(
      'Удалить запись?',
      `Запись «${item.title || 'Без названия'}» будет удалена из базы знаний.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRagEntry(sessionBotId, String(item.ragEntryId));
              setKbItems((prev) => prev.filter((i) => i.id !== item.id));
            } catch (e) {
              Alert.alert('Ошибка', e?.message || 'Не удалось удалить запись.');
            }
          },
        },
      ],
    );
  }, [sessionBotId]);

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
        {/* ── Аккаунт ── */}
        <Text style={styles.sectionLabel}>Аккаунт</Text>
        {meLoading ? (
          <View style={styles.accountCardLoading}>
            <ActivityIndicator color="#2563EB" />
          </View>
        ) : meUser ? (
          <View style={styles.accountCardOk}>
            <Text style={styles.accountEmail} selectable>
              {displayEmail(meUser.email)}
            </Text>
            <Text style={styles.accountCreated}>
              Аккаунт создан: {formatAccountDate(meUser.createdAt)}
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={() => setRegisterModalVisible(true)}
            style={({ pressed }) => [
              styles.accountBanner,
              pressed && styles.accountBannerPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Создать аккаунт, чтобы сохранить агента"
          >
            <View style={styles.accountBannerIcon}>
              <Ionicons name="person-add-outline" size={22} color="#1D4ED8" />
            </View>
            <Text style={styles.accountBannerText}>
              Создайте аккаунт, чтобы сохранить агента
            </Text>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </Pressable>
        )}

        {/* ── Основная инструкция ── */}
        <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
          Основная инструкция
        </Text>
        <Text style={styles.sectionHint}>
          Общие правила для агента: роль, компания, тон и темы, о которых можно говорить.
          Редактируйте текст ниже; на каждом этапе к этой инструкции добавляется свой промпт
          сценария.
        </Text>
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
        {sessionBotId ? (
          <>
            {savingInstruction ? (
              <View style={styles.instructionSavingRow} accessibilityLiveRegion="polite">
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.instructionSavingText}>Сохранение…</Text>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[styles.sectionHint, styles.instructionPersistHint]}>
            Бот не найден (нет id в сессии и в списке GET /api/bots) — сохранить инструкцию на
            сервере нельзя. Обновите экран после создания бота.
          </Text>
        )}

        {/* ── Этапы ── */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Этапы</Text>
        <Text style={styles.sectionHint}>
          Этапы — шаги сценария: у каждого свой промпт и переходы дальше по диалогу. В карточке
          этапа можно редактировать название, создавать/удалять связи переходов и удалять сам этап.
          Изменения сохраняются автоматически (при входе в аккаунт).
        </Text>
        <StageActions onCreate={createStage} />
        {savingStages ? (
          <View style={styles.instructionSavingRow} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.instructionSavingText}>Сохранение этапов…</Text>
          </View>
        ) : null}

        {sortedStages.map((stage, sortedIndex) => {
          const displayOrder =
            typeof stage.order === 'number' && !Number.isNaN(stage.order)
              ? stage.order
              : sortedIndex + 1;
          return (
            <View key={stage.id} style={styles.stageCard}>
              <StageRow
                stage={stage}
                displayOrder={displayOrder}
                onOpen={openStageDetail}
              />
            </View>
          );
        })}

        {/* ── База знаний (RAG) ── */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
          База знаний
        </Text>
        <Text style={styles.kbSectionHint}>
          Материалы, из которых агент черпает факты при ответах в WhatsApp.
        </Text>
        {kbItems.length === 0 ? (
          <View style={styles.kbEmpty}>
            <View style={styles.kbEmptyIconWrap}>
              <Ionicons name="sparkles-outline" size={28} color="#93C5FD" />
            </View>
            <Text style={styles.kbEmptyTitle}>Пока пусто</Text>
            <Text style={styles.kbEmptyText}>
              Добавьте текст вручную или загрузите файл — записи появятся в списке ниже.
            </Text>
          </View>
        ) : (
          <View style={styles.kbList}>
            {kbItems.map((item) => (
              <KnowledgeItem
                key={item.id}
                item={item}
                onOpen={openKbEntry}
                onRemove={removeKbItem ? () => removeKbItem(item) : undefined}
              />
            ))}
          </View>
        )}

        <View style={styles.kbActionsWrap}>
          <Pressable
            style={({ pressed }) => [
              styles.createStageBtn,
              pressed && styles.createStageBtnPressed,
            ]}
            onPress={() => setKbTextModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Добавить запись в базу знаний"
          >
            <Ionicons name="add-circle-outline" size={20} color="#1D4ED8" />
            <Text style={styles.createStageBtnText}>Добавить запись</Text>
          </Pressable>
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
        saving={kbSaving}
      />

      <InstructionModal
        visible={expandedInstruction}
        onClose={() => setExpandedInstruction(false)}
        instruction={instruction}
        onChangeInstruction={setInstruction}
      />

      <RegisterAccountModal
        visible={registerModalVisible}
        onClose={() => setRegisterModalVisible(false)}
        onRegistered={() => {
          setRegisterModalVisible(false);
          loadMe();
        }}
      />

      <KbEntryViewModal
        visible={kbViewItem != null}
        item={kbViewItem}
        onClose={() => setKbViewItem(null)}
        onDelete={(item) => {
          setKbViewItem(null);
          removeKbItem(item);
        }}
      />

      <StageDetailModal
        visible={stageViewStage != null}
        stage={stageViewStage}
        allStages={sortedStages}
        onOpenStage={openStageDetail}
        onClose={() => setStageViewStage(null)}
        botId={sessionBotId}
        canPersistBot={canPersistBot}
        onPromptSaved={handleStagePromptSaved}
        onSaveStageMeta={saveStageMeta}
        onDeleteStage={deleteStage}
      />
    </KeyboardAvoidingView>
  );
}

function StageDetailModal({
  visible,
  stage,
  allStages,
  onOpenStage,
  onClose,
  botId,
  canPersistBot,
  onPromptSaved,
  onSaveStageMeta,
  onDeleteStage,
}) {
  const stageId = stage?.id;
  const promptFromParent =
    stage && typeof stage.prompt === 'string' ? stage.prompt : '';
  const [localTitle, setLocalTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [addMoveOpen, setAddMoveOpen] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [localPrompt, setLocalPrompt] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const lastStagePromptPersistedRef = useRef('');
  const localPromptRef = useRef(localPrompt);
  localPromptRef.current = localPrompt;

  const canSaveThisStage =
    Boolean(stage) &&
    Boolean(canPersistBot) &&
    Boolean(botId) &&
    isLikelyMongoObjectId(String(stageId ?? ''));

  useEffect(() => {
    if (visible && stageId != null) {
      setLocalTitle(typeof stage?.title === 'string' ? stage.title : '');
      setEditingTitle(false);
      setAddMoveOpen(false);
      setConfirmDeleteVisible(false);
      setLocalPrompt(promptFromParent);
      lastStagePromptPersistedRef.current = promptFromParent;
    }
  }, [visible, stageId, promptFromParent, stage?.title]);

  useEffect(() => {
    if (!visible || !canSaveThisStage || !botId || stageId == null) {
      return undefined;
    }
    if (localPrompt === lastStagePromptPersistedRef.current) {
      return undefined;
    }
    const handle = setTimeout(() => {
      const latest = localPromptRef.current;
      if (latest === lastStagePromptPersistedRef.current) return;
      setSavingPrompt(true);
      (async () => {
        try {
          const r = await patchBotStagePrompt(botId, String(stageId), latest);
          if (r.ok) {
            lastStagePromptPersistedRef.current = latest;
            onPromptSaved?.(String(stageId), latest);
          } else if (r.status === 401 || r.status === 403) {
            Alert.alert(
              'Нужна авторизация',
              'Промпт этапа не сохранился: войдите в аккаунт.',
            );
          }
        } catch {
          /* сеть — повтор при следующей паузе */
        } finally {
          setSavingPrompt(false);
        }
      })();
    }, 1600);
    return () => clearTimeout(handle);
  }, [
    localPrompt,
    visible,
    canSaveThisStage,
    botId,
    stageId,
    onPromptSaved,
  ]);

  if (!stage) return null;

  const moves = Array.isArray(stage.allowedMoves) ? stage.allowedMoves : [];
  const order =
    typeof stage.order === 'number' && !Number.isNaN(stage.order)
      ? stage.order
      : null;
  const stagesList = Array.isArray(allStages) ? allStages : [];
  const moveLinks = moves
    .map((m) => {
      const raw = String(m ?? '').trim();
      const target = resolveMoveToStage(raw, stagesList);
      const key = target ? String(target.id) : `raw:${raw}`;
      return { raw, target, key };
    })
    .filter((x) => x.raw);
  const dedup = [];
  const seen = new Set();
  for (const item of moveLinks) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    dedup.push(item);
  }
  const moveIds = dedup
    .filter((x) => x.target)
    .map((x) => String(x.target.id));
  const availableTargets = stagesList.filter(
    (s) => String(s.id) !== String(stageId),
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <View style={styles.stageModalHeaderLeft}>
            {order != null ? (
              <View style={styles.stageOrderBadgeLarge} accessibilityLabel={`Этап ${order}`}>
                <Text style={styles.stageOrderBadgeLargeText}>{order}</Text>
              </View>
            ) : null}
            {editingTitle ? (
              <TextInput
                style={styles.stageTitleHeaderInput}
                value={localTitle}
                onChangeText={setLocalTitle}
                onBlur={() => {
                  setEditingTitle(false);
                  onSaveStageMeta?.(String(stageId), {
                    title: localTitle.trim() || 'Без названия',
                  });
                }}
                autoFocus
                placeholder="Название этапа…"
                placeholderTextColor="#9CA3AF"
                accessibilityLabel="Название этапа в заголовке"
                {...(Platform.OS === 'web' && { outlineStyle: 'none' })}
              />
            ) : (
              <Pressable
                onPress={() => setEditingTitle(true)}
                style={({ pressed }) => [
                  styles.stageHeaderTitlePressable,
                  pressed && styles.stageHeaderTitlePressablePressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Переименовать этап"
              >
                <Text
                  style={[styles.modalTitle, styles.kbViewModalTitle, styles.stageModalTitleFlex]}
                  numberOfLines={3}
                >
                  {stage.title || 'Этап'}
                </Text>
              </Pressable>
            )}
          </View>
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
          style={styles.stageModalScroll}
          contentContainerStyle={[
            styles.stageModalScrollContent,
            typeof onDelete === 'function' && { paddingBottom: 96 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Text style={styles.stageModalBlockTitle}>Промпт этапа</Text>
          <Text style={styles.stageModalBlockHint}>
            Что агент учитывает на этом шаге. Текст сохраняется на сервере сам через ~1,6 с
            после паузы в наборе (если доступно).
          </Text>
          <TextInput
            style={styles.stagePromptInput}
            value={localPrompt}
            onChangeText={setLocalPrompt}
            multiline
            textAlignVertical="top"
            placeholder="Текст промпта для этого этапа…"
            placeholderTextColor="#9CA3AF"
            accessibilityLabel="Промпт этапа, редактирование"
            {...(Platform.OS === 'web' && { outlineStyle: 'none' })}
          />
          {canSaveThisStage ? (
            <>
              {savingPrompt ? (
                <View style={styles.instructionSavingRow}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.instructionSavingText}>Сохранение…</Text>
                </View>
              ) : null}
              <Text style={[styles.sectionHint, styles.stagePromptPersistHint]}>
                Автосохранение при паузе в наборе.
              </Text>
            </>
          ) : (
            <Text style={[styles.sectionHint, styles.stagePromptPersistHint]}>
              {!canPersistBot
                ? 'Автосохранение на сервере — после входа в аккаунт и при активном боте.'
                : 'Этот этап нельзя синхронизировать с сервером (нет id этапа с бэкенда).'}
            </Text>
          )}

          <View style={styles.stageModalDivider} />
          <Text style={styles.stageModalBlockTitle}>Возможные переходы</Text>
          <Text style={styles.stageModalBlockHint}>
            Свяжите этот этап с другими шагами, куда можно перевести диалог.
          </Text>
          {moveIds.length === 0 ? (
            <Text style={styles.stageModalPlaceholder}>Переходы пока не добавлены.</Text>
          ) : (
            dedup.map((item) => {
              const target = item.target;
              const targetOrder = displayOrderForStageInList(target, stagesList);
              const label = target?.title != null ? String(target.title) : item.raw;
              const canOpen = target != null && typeof onOpenStage === 'function';
              return (
                <View key={item.key} style={styles.transitionCardOuter}>
                  <Pressable
                    disabled={!canOpen}
                    onPress={() => canOpen && onOpenStage(target)}
                    style={({ pressed }) => [
                      styles.transitionCardInner,
                      canOpen && pressed && styles.transitionCardOuterPressed,
                      Platform.OS === 'web' && canOpen && { cursor: 'pointer' },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !canOpen }}
                    accessibilityLabel={
                      canOpen
                        ? `Открыть этап: ${label}`
                        : `Переход: ${label}, этап не найден в списке`
                    }
                  >
                    {targetOrder != null ? (
                      <View style={styles.transitionOrderBadge} accessibilityElementsHidden>
                        <Text style={styles.transitionOrderBadgeText}>{targetOrder}</Text>
                      </View>
                    ) : (
                      <View style={styles.transitionOrderBadgeMuted} accessibilityElementsHidden>
                        <Text style={styles.transitionOrderBadgeMutedText}>?</Text>
                      </View>
                    )}
                    <Text style={styles.transitionCardTitle} numberOfLines={3}>
                      {label}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const removeId = target ? String(target.id) : null;
                      const next = removeId
                        ? moveIds.filter((x) => x !== removeId)
                        : moveIds;
                      onSaveStageMeta?.(String(stageId), { allowedMoves: next });
                    }}
                    style={({ pressed }) => [
                      styles.transitionRemoveBtn,
                      pressed && styles.transitionRemoveBtnPressed,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Удалить переход в этап ${label}`}
                  >
                    <Ionicons name="close-outline" size={18} color="#DC2626" />
                  </Pressable>
                </View>
              );
            })
          )}
          <Text style={[styles.stageModalBlockTitle, { marginTop: 16 }]}>
            Добавить переход
          </Text>
          <Pressable
            onPress={() => setAddMoveOpen((v) => !v)}
            style={({ pressed }) => [
              styles.addMoveSelectBtn,
              pressed && styles.addMoveSelectBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Добавить переход"
          >
            <Text style={styles.addMoveSelectText}>Добавить переход</Text>
            <Ionicons
              name={addMoveOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#1D4ED8"
            />
          </Pressable>
          {addMoveOpen ? (
            <View style={styles.addMoveDropdown}>
              {availableTargets.filter((t) => !moveIds.includes(String(t.id))).length === 0 ? (
                <Text style={styles.stageModalPlaceholder}>
                  Нет доступных этапов для добавления.
                </Text>
              ) : (
                availableTargets
                  .filter((t) => !moveIds.includes(String(t.id)))
                  .map((t) => {
                    const targetId = String(t.id);
                    const ord = displayOrderForStageInList(t, stagesList);
                    return (
                      <Pressable
                        key={targetId}
                        onPress={() => {
                          onSaveStageMeta?.(String(stageId), {
                            allowedMoves: [...moveIds, targetId],
                          });
                          setAddMoveOpen(false);
                        }}
                        style={({ pressed }) => [
                          styles.addMoveOption,
                          pressed && styles.addMoveOptionPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Добавить переход: ${t.title}`}
                      >
                        <Text style={styles.addMoveOptionText}>
                          {ord != null ? `${ord}. ` : ''}
                          {t.title}
                        </Text>
                      </Pressable>
                    );
                  })
              )}
            </View>
          ) : null}
          <View style={styles.stageModalDivider} />
          <Pressable
            onPress={() => setConfirmDeleteVisible(true)}
            style={({ pressed }) => [
              styles.deleteStagePrimaryBtn,
              pressed && styles.deleteStagePrimaryBtnPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Удалить этап ${stage.title || 'без названия'}`}
          >
            <Ionicons name="trash-outline" size={18} color="#fff" />
            <Text style={styles.deleteStagePrimaryText}>Удалить этап</Text>
          </Pressable>
        </ScrollView>
        {confirmDeleteVisible ? (
          <View style={styles.confirmOverlay}>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmTitle}>Удалить этап?</Text>
              <Text style={styles.confirmText}>
                Этап «{stage?.title || 'Без названия'}» будет удалён вместе со связями переходов.
                Это действие нельзя отменить.
              </Text>
              <View style={styles.confirmActions}>
                <Pressable
                  onPress={() => setConfirmDeleteVisible(false)}
                  style={({ pressed }) => [
                    styles.confirmCancelBtn,
                    pressed && styles.confirmCancelBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Отменить удаление этапа"
                >
                  <Text style={styles.confirmCancelText}>Отмена</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setConfirmDeleteVisible(false);
                    onDeleteStage?.(stage);
                  }}
                  style={({ pressed }) => [
                    styles.confirmDeleteBtn,
                    pressed && styles.confirmDeleteBtnPressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Подтвердить удаление этапа"
                >
                  <Text style={styles.confirmDeleteText}>Удалить</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function KbEntryViewModal({ visible, item, onClose, onDelete }) {
  if (!item) return null;
  const isFile = item.type === 'file';
  const bodyText =
    !isFile && typeof item.text === 'string' ? item.text : '';
  const typeLine =
    item.source === 'rag' && item.ragType != null
      ? String(item.ragType)
      : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, styles.kbViewModalTitle]} numberOfLines={3}>
            {item.title || 'Запись'}
          </Text>
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
          style={styles.stageModalScroll}
          contentContainerStyle={styles.stageModalScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <Text style={styles.kbViewMetaLine}>
            {isFile ? 'Файл' : 'Текст'}
            {typeLine ? ` · ${typeLine}` : ''}
            {isFile && item.fileSize ? ` · ${item.fileSize}` : ''}
          </Text>

          <Text style={styles.stageModalBlockTitle}>
            {isFile ? 'Файл' : 'Содержимое'}
          </Text>
          <Text style={styles.stageModalBlockHint}>
            {isFile
              ? 'Содержимое в приложении не открывается — используйте файл на устройстве.'
              : 'Текст, который агент использует в ответах.'}
          </Text>
          {isFile ? (
            <Text style={styles.stageModalPlaceholder}>
              Откройте документ на устройстве или загрузите его снова при необходимости.
            </Text>
          ) : (
            <Text style={styles.stageModalBodyText} selectable>
              {bodyText.trim() ? bodyText : 'Текст пустой'}
            </Text>
          )}
        </ScrollView>
        {typeof onDelete === 'function' ? (
          <View style={styles.kbEntryDeleteFooter}>
            <Pressable
              onPress={() => onDelete(item)}
              style={({ pressed }) => [
                styles.deleteStagePrimaryBtn,
                pressed && styles.deleteStagePrimaryBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Удалить запись ${item.title || ''}`}
            >
              <Ionicons name="trash-outline" size={18} color="#fff" />
              <Text style={styles.deleteStagePrimaryText}>Удалить запись</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
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
  saving = false,
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
              (!kbDraftText.trim() || saving) && styles.kbModalSaveBtnDisabled,
            ]}
            onPress={onSave}
            disabled={!kbDraftText.trim() || saving}
            accessibilityRole="button"
            accessibilityLabel="Сохранить запись"
          >
            {saving ? (
              <ActivityIndicator color="#9CA3AF" />
            ) : (
              <Text
                style={[
                  styles.kbModalSaveText,
                  !kbDraftText.trim() && styles.kbModalSaveTextDisabled,
                ]}
              >
                Сохранить
              </Text>
            )}
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

  accountCardLoading: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  accountCardOk: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  accountEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  accountCreated: {
    fontSize: 14,
    color: '#6B7280',
  },
  accountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.2)',
  },
  accountBannerPressed: {
    backgroundColor: '#DBEAFE',
  },
  accountBannerIcon: {
    marginRight: 12,
  },
  accountBannerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#1E40AF',
    lineHeight: 21,
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
  instructionSavingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginLeft: 4,
  },
  instructionSavingText: {
    fontSize: 13,
    color: '#6B7280',
  },
  instructionPersistHint: {
    marginTop: 8,
  },
  /* Stage cards */
  sectionHint: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 10,
    marginLeft: 4,
    lineHeight: 18,
  },
  stageCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  stageOrderBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  stageOrderBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  stageModalHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    marginRight: 8,
  },
  stageOrderBadgeLarge: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stageOrderBadgeLargeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  stageModalTitleFlex: {
    flex: 1,
    minWidth: 0,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 20,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  stageRowPressed: {
    backgroundColor: '#F9FAFB',
  },
  stageTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  createStageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 12,
    marginBottom: 10,
  },
  createStageBtnPressed: {
    backgroundColor: '#DBEAFE',
  },
  createStageBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1D4ED8',
  },

  /* Модалки этапа / записи БЗ — плоский скролл без вложенных карточек */
  stageModalScroll: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  stageModalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
  },
  stageModalBlockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 12,
  },
  stageModalBlockHint: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 19,
  },
  stageModalBodyText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#1F2937',
  },
  stagePromptInput: {
    fontSize: 15,
    lineHeight: 24,
    color: '#1F2937',
    minHeight: 160,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    marginBottom: 14,
  },
  stageHeaderTitlePressable: {
    flex: 1,
    minWidth: 0,
    borderRadius: 8,
  },
  stageHeaderTitlePressablePressed: {
    opacity: 0.8,
  },
  stageTitleHeaderInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F9FAFB',
  },
  stagePromptPersistHint: {
    marginBottom: 8,
    marginTop: 4,
  },
  stageModalPlaceholder: {
    fontSize: 14,
    lineHeight: 22,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },
  stageModalDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E5E7EB',
    marginVertical: 22,
  },
  transitionCardOuter: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  transitionCardOuterDisabled: {
    opacity: 0.62,
    backgroundColor: '#F9FAFB',
  },
  transitionCardOuterPressed: {
    backgroundColor: '#F3F4F6',
  },
  transitionCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    flex: 1,
  },
  transitionOrderBadge: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  transitionOrderBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#047857',
  },
  transitionOrderBadgeMuted: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  transitionOrderBadgeMutedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#9CA3AF',
  },
  transitionCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginRight: 8,
  },
  transitionRemoveBtn: {
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#F3F4F6',
    backgroundColor: '#FFF',
  },
  transitionRemoveBtnPressed: {
    backgroundColor: '#FEE2E2',
  },
  transitionCandidate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
  },
  transitionCandidateActive: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  transitionCandidatePressed: {
    opacity: 0.85,
  },
  transitionCandidateText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
  },
  addMoveSelectBtn: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  addMoveSelectBtnPressed: {
    backgroundColor: '#DBEAFE',
  },
  addMoveSelectText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  addMoveDropdown: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
    marginBottom: 8,
  },
  addMoveOption: {
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  addMoveOptionPressed: {
    backgroundColor: '#F9FAFB',
  },
  addMoveOptionText: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '500',
  },
  deleteStagePrimaryBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 13,
  },
  deleteStagePrimaryBtnPressed: {
    backgroundColor: '#B91C1C',
  },
  deleteStagePrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  kbEntryDeleteFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 12,
  },
  confirmOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(17,24,39,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 50,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
  },
  confirmTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
  },
  confirmText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#4B5563',
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  confirmCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  confirmCancelBtnPressed: {
    backgroundColor: '#F9FAFB',
  },
  confirmCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  confirmDeleteBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#DC2626',
  },
  confirmDeleteBtnPressed: {
    backgroundColor: '#B91C1C',
  },
  confirmDeleteText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  kbViewMetaLine: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
    fontWeight: '500',
  },

  /* Knowledge base */
  kbSectionHint: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 10,
    marginLeft: 4,
    lineHeight: 18,
  },
  kbEmpty: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  kbEmptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  kbEmptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  kbEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 280,
  },
  kbList: {
    paddingBottom: 4,
  },
  kbItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  kbItemPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    minWidth: 0,
    ...(Platform.OS === 'web' && { cursor: 'pointer' }),
  },
  kbItemPressablePressed: {
    backgroundColor: '#F9FAFB',
  },
  kbItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  kbItemIconFile: {
    backgroundColor: '#FEF3C7',
  },
  kbItemIconText: {
    backgroundColor: '#DBEAFE',
  },
  kbItemBody: {
    flex: 1,
    minWidth: 0,
  },
  kbItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flexShrink: 1,
    lineHeight: 22,
  },
  kbItemMeta: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  kbItemChevron: {
    marginLeft: 4,
  },
  kbItemRemove: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#F3F4F6',
    backgroundColor: '#FAFAFA',
  },
  kbActionsWrap: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  kbActionsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginLeft: 2,
  },
  kbActions: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
  },
  kbActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  kbActionBtnPressed: {
    backgroundColor: '#F3F4F6',
  },
  kbActionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kbActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  kbViewModalTitle: {
    flex: 1,
    marginRight: 8,
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
