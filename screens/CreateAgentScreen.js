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

/** r=14 + stroke 2 → внешний диаметр ~32px, как у круга с обводкой и заливки */
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

const STEPS = [
  'Анализируем Instagram-профиль',
  'Определяем тон общения',
  'Извлекаем данные из постов',
  'Создаём сценарии диалогов',
  'Настраиваем правила поведения',
  'Финальная проверка',
];

const STEP_DURATION_MS = 2200;

const AUTO_NAVIGATE_DELAY_MS = 1500;

export default function CreateAgentScreen({ account, onComplete }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const timerRef = useRef(null);

  useEffect(() => {
    if (currentStepIndex >= STEPS.length) return;
    timerRef.current = setTimeout(() => {
      setCurrentStepIndex((prev) => prev + 1);
    }, STEP_DURATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentStepIndex]);

  const allDone = currentStepIndex >= STEPS.length;

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
        <Text style={styles.title}>Создаём вашего AI-менеджера…</Text>

        <View style={styles.steps}>
          {STEPS.map((label, index) => {
            const isDone = index < currentStepIndex;
            const isLoading = index === currentStepIndex && !allDone;
            const isCurrent = isLoading;
            return (
              <View key={index} style={styles.stepRow}>
                <View
                  style={[
                    styles.stepIcon,
                    isDone && styles.stepIconDone,
                    isLoading && styles.stepIconLoading,
                  ]}
                >
                  {isDone ? (
                    <Ionicons name="checkmark" size={20} color="#fff" />
                  ) : isLoading ? (
                    <StepRingLoader />
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.stepLabel,
                    isDone && styles.stepLabelDone,
                    isCurrent && styles.stepLabelCurrent,
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
        {allDone && (
          <Text style={styles.allDoneText}>Готово! Ваш AI-менеджер создан.</Text>
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
    paddingTop: 32,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 32,
  },
  steps: {
    gap: 0,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  /** Одинаковый слот 32×32: ожидание / лоадер / галочка — без скачка по сетке */
  stepIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 16,
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
  stepLabel: {
    fontSize: 16,
    color: '#94a3b8',
    flex: 1,
  },
  stepLabelDone: {
    color: '#94a3b8',
  },
  stepLabelCurrent: {
    color: '#0f172a',
    fontWeight: '600',
  },
  allDoneText: {
    marginTop: 24,
    fontSize: 17,
    fontWeight: '600',
    color: '#1e40af',
  },
});
