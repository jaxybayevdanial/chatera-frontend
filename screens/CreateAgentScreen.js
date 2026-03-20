import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { fetchBotStatus } from '../api/chatera';

/** r=14 + stroke 2 → внешний диаметр ~32px */
const RING_R = 14;
const RING_C = 2 * Math.PI * RING_R;
const ARC_LEN = RING_C * 0.26;

function StepRingLoader() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 850,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  return (
    <Animated.View
      style={[styles.ringLoaderWrap, { transform: [{ rotate }] }]}
      accessibilityRole="progressbar"
      accessibilityLabel="Загрузка"
    >
      <Svg width={32} height={32} viewBox="0 0 32 32">
        <Circle
          cx={16}
          cy={16}
          r={RING_R}
          stroke="#cbd5e1"
          strokeWidth={2}
          fill="none"
        />
        <Circle
          cx={16}
          cy={16}
          r={RING_R}
          stroke="#1e40af"
          strokeWidth={2}
          fill="none"
          strokeDasharray={`${ARC_LEN} ${RING_C}`}
          strokeLinecap="round"
          transform="rotate(-90 16 16)"
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Порядок совпадает с цепочкой на бэкенде (instagram-process-account + генерация бота).
 * progress: fetch_profile → fetch_posts → fetch_highlights → ai_processing → (account completed) creating_bot
 */
const GENERATION_STEPS = [
  {
    title: 'Изучаем профиль',
    value:
      'Загружаем шапку и описание Instagram — агент поймёт, кто вы и чем занимаетесь.',
  },
  {
    title: 'Собираем посты',
    value:
      'Подтягиваем публикации: темы, визуал и примеры того, как вы говорите с аудиторией.',
  },
  {
    title: 'Актуальное и обложки',
    value:
      'При необходимости забираем highlights — больше контекста для точных ответов в чате.',
  },
  {
    title: 'ИИ разбирает контент',
    value:
      'Анализируем фото и видео: тон бренда, офферы и типичные вопросы клиентов.',
  },
  {
    title: 'Собираем AI-менеджера',
    value:
      'Генерируем инструкцию, этапы сценария и базу знаний под WhatsApp.',
  },
];

const CREATING_BOT_PROGRESS_SNIPPETS = [
  'bot generation',
  'generation in progress',
  'creating',
];

/**
 * Индекс активного шага (0..n-1). n = все завершены и можно показать «Готово».
 * При stage === 'done' → GENERATION_STEPS.length
 */
function backendToActiveStepIndex(stage, progress) {
  const st = typeof stage === 'string' ? stage.toLowerCase() : '';
  const pr = typeof progress === 'string' ? progress.toLowerCase() : '';

  if (st === 'done') return GENERATION_STEPS.length;
  if (st === 'failed') return -1;

  if (st === 'creating_bot' || st === 'creating-bot' || st === 'building_bot') return 4;

  if (st === 'parsing') {
    if (pr === 'fetch_profile') return 0;
    if (pr === 'fetch_posts') return 1;
    if (pr === 'fetch_highlights') return 2;
    if (pr === 'ai_processing') return 3;
    if (pr === 'analyzing_content' || pr === 'analyze_content' || pr === 'llm_processing') return 3;
    if (pr === 'completed') return 3;
    // Очередь / общий processing — ещё ранняя фаза
    if (pr === 'queued' || pr === 'processing') return 0;
    if (CREATING_BOT_PROGRESS_SNIPPETS.some((s) => pr.includes(s))) return 4;
    return 0;
  }

  // Иногда сервер отдаёт progress без ожидаемого stage
  if (pr === 'fetch_profile') return 0;
  if (pr === 'fetch_posts') return 1;
  if (pr === 'fetch_highlights') return 2;
  if (
    pr === 'ai_processing' ||
    pr === 'analyzing_content' ||
    pr === 'analyze_content' ||
    pr === 'llm_processing'
  ) {
    return 3;
  }
  if (
    pr === 'creating_bot' ||
    pr === 'creating-bot' ||
    pr === 'build_bot' ||
    CREATING_BOT_PROGRESS_SNIPPETS.some((s) => pr.includes(s))
  ) {
    return 4;
  }

  return 0;
}

/** Короткая строка «что сейчас» под заголовком экрана */
function liveStatusLine(stage, progress, accountStatus) {
  const st = typeof stage === 'string' ? stage : '';
  const pr = typeof progress === 'string' ? progress : '';
  const idx = backendToActiveStepIndex(st, pr);
  if (idx < 0) return '';
  if (idx >= GENERATION_STEPS.length) return 'Финишируем…';
  const step = GENERATION_STEPS[idx];
  const ac =
    typeof accountStatus === 'string' ? accountStatus : '';
  if (st === 'parsing' && (pr === 'queued' || pr === 'processing') && ac) {
    return `${step.title} · ждём очередь на сервере`;
  }
  return `${step.title} — ${step.value}`;
}

const POLL_INTERVAL_MS = 2500;
const AUTO_NAVIGATE_DELAY_MS = 1200;

export default function CreateAgentScreen({ account, onComplete }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [liveLine, setLiveLine] = useState(() =>
    liveStatusLine('parsing', 'fetch_profile', 'processing'),
  );
  const [pollError, setPollError] = useState('');
  const [failed, setFailed] = useState(false);
  const pollRef = useRef(null);
  const doneRef = useRef(false);

  useEffect(() => {
    doneRef.current = false;

    const poll = async () => {
      if (doneRef.current) return;
      try {
        const { status, data } = await fetchBotStatus();

        if (status === 202) {
          const st = data?.stage;
          const pr = data?.progress;
          const ac = data?.accountStatus;
          if (st === 'failed' || data?.success === false) {
            setFailed(true);
            setPollError(data?.message || 'Не удалось обработать аккаунт');
            return;
          }
          const idx = backendToActiveStepIndex(st, pr);
          if (idx >= 0) {
            setCurrentStepIndex((prev) => Math.max(prev, idx));
            setLiveLine(liveStatusLine(st, pr, ac));
          }
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (status === 200) {
          const st = typeof data?.stage === 'string' ? data.stage.toLowerCase() : '';
          const pr = data?.progress;
          const ac = data?.accountStatus;
          const hasBot =
            data?.bot != null &&
            (data.bot?._id != null || data.bot?.id != null);

          if (st === 'done' || hasBot) {
            setCurrentStepIndex(GENERATION_STEPS.length);
            setLiveLine('Готово — переносим вас к агенту');
          } else if (st === 'failed' || data.success === false) {
            setFailed(true);
            setPollError(data.message || 'Не удалось создать бота');
          } else {
            const idx = backendToActiveStepIndex(st, pr);
            if (idx >= 0) {
              setCurrentStepIndex((prev) => Math.max(prev, idx));
              setLiveLine(liveStatusLine(st, pr, ac));
            }
            pollRef.current = setTimeout(poll, POLL_INTERVAL_MS * 2);
          }
        } else {
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS * 2);
        }
      } catch {
        if (!doneRef.current) {
          pollRef.current = setTimeout(poll, POLL_INTERVAL_MS * 2);
        }
      }
    };

    pollRef.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      doneRef.current = true;
      clearTimeout(pollRef.current);
    };
  }, []);

  const allDone = currentStepIndex >= GENERATION_STEPS.length;
  const progressRatio =
    GENERATION_STEPS.length > 0
      ? Math.min(
          1,
          (currentStepIndex + (allDone ? 0.15 : 0.35)) / GENERATION_STEPS.length,
        )
      : 0;

  useEffect(() => {
    if (!allDone || !onComplete) return;
    const t = setTimeout(onComplete, AUTO_NAVIGATE_DELAY_MS);
    return () => clearTimeout(t);
  }, [allDone, onComplete]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {account?.username ? (
        <View style={styles.header}>
          <Text style={styles.headerAccount} numberOfLines={1}>
            @{account.username}
          </Text>
        </View>
      ) : (
        <View style={styles.headerSpacer} />
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Создаём вашего AI-менеджера</Text>
        {!failed ? (
          <Text style={styles.liveLine} numberOfLines={5}>
            {liveLine}
          </Text>
        ) : null}

        {!failed ? (
          <View style={styles.progressTrack} accessibilityRole="progressbar">
            <View
              style={[styles.progressFill, { width: `${progressRatio * 100}%` }]}
            />
          </View>
        ) : null}

        <Text style={styles.stepsSectionTitle}>Этапы</Text>

        <View style={styles.steps}>
          {GENERATION_STEPS.map((step, index) => {
            const isDone = index < currentStepIndex;
            const isLoading =
              index === currentStepIndex && !allDone && !failed;
            return (
              <View key={step.title} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepIcon,
                    isDone && styles.stepIconDone,
                    isLoading && styles.stepIconLoading,
                    failed && index === currentStepIndex && styles.stepIconFailed,
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  ) : isLoading ? (
                    <StepRingLoader />
                  ) : null}
                </View>
                <View style={styles.stepTextCol}>
                  <Text
                    style={[
                      styles.stepTitle,
                      isDone && styles.stepTitleDone,
                      isLoading && styles.stepTitleCurrent,
                    ]}
                  >
                    {step.title}
                  </Text>
                  <Text
                    style={[
                      styles.stepValue,
                      isLoading && styles.stepValueCurrent,
                    ]}
                  >
                    {step.value}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        {allDone && !failed && (
          <Text style={styles.allDoneText}>Готово! Ваш AI-менеджер создан.</Text>
        )}
        {failed && (
          <Text style={styles.errorText}>
            {pollError || 'Ошибка создания агента'}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'web' ? 24 : 56,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerSpacer: {
    paddingTop: Platform.OS === 'web' ? 24 : 56,
    paddingBottom: 8,
  },
  headerAccount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 10,
  },
  liveLine: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    marginBottom: 20,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 28,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#1e40af',
  },
  stepsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  steps: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 14,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIconDone: {
    backgroundColor: '#1e40af',
    borderColor: '#1e40af',
  },
  stepIconLoading: {
    borderWidth: 0,
    backgroundColor: 'transparent',
    width: 32,
    height: 32,
  },
  ringLoaderWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTextCol: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
    marginBottom: 4,
  },
  stepTitleDone: {
    color: '#64748b',
    fontWeight: '600',
  },
  stepTitleCurrent: {
    color: '#0f172a',
    fontWeight: '700',
  },
  stepValue: {
    fontSize: 14,
    lineHeight: 20,
    color: '#cbd5e1',
  },
  stepValueCurrent: {
    color: '#64748b',
  },
  allDoneText: {
    marginTop: 24,
    fontSize: 17,
    fontWeight: '600',
    color: '#1e40af',
  },
  errorText: {
    marginTop: 24,
    fontSize: 15,
    lineHeight: 22,
    color: '#b91c1c',
  },
  stepIconFailed: {
    borderColor: '#fca5a5',
    backgroundColor: '#fee2e2',
  },
});
