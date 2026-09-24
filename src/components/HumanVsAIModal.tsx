import React, { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Bot,
  ChevronRight,
  Flame,
  Lock,
  Play,
  Shield,
  Swords,
  Trophy,
  X,
  Zap,
} from 'lucide-react-native';
import { AI_BOT_LEVELS, AIBotProfile } from '../utils/aiBotService';
import { ExerciseItem } from '../utils/exerciseService';

import { makeStyles, ThemeColors, useColors } from '../theme';
interface HumanVsAIModalProps {
  visible: boolean;
  onClose: () => void;
  exercises: ExerciseItem[];
  selectedExerciseId?: string;
  onStartMatch: (bot: AIBotProfile, exerciseId: string) => void;
}

export const HumanVsAIModal: React.FC<HumanVsAIModalProps> = ({
  visible,
  onClose,
  exercises,
  selectedExerciseId = '1',
  onStartMatch,
}) => {
  const colors = useColors();
  const styles = useStyles();
  const [selectedBot, setSelectedBot] = useState<AIBotProfile>(AI_BOT_LEVELS[1]);
  const [chosenExerciseId, setChosenExerciseId] = useState<string>('1');

  const selectedExercise = exercises.find((e) => e.id === chosenExerciseId) || exercises[0] || {
    id: '1',
    name: 'Squats',
  };

  const estTotalCalories = selectedBot.estCaloriesPerMin * 2;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          {/* Top Header */}
          <View style={styles.modalHeaderRow}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.badgePill}>
                <Flame size={12} color="#E25822" style={{ marginRight: 4 }} />
                <Text style={styles.badgePillText}>AI DUEL</Text>
              </View>
              <Text style={styles.modalMainTitle}>Human vs AI</Text>
            </View>

            <TouchableOpacity style={styles.closeBtn} activeOpacity={0.8} onPress={onClose}>
              <X size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {/* 1. SELECT AI DIFFICULTY */}
            <Text style={styles.sectionLabel}>DIFFICULTY</Text>
            <View style={styles.botGrid}>
              {AI_BOT_LEVELS.map((bot) => {
                const isSelected = selectedBot.id === bot.id;
                return (
                  <TouchableOpacity
                    key={bot.id}
                    style={[
                      styles.botCard,
                      isSelected && { borderColor: '#E25822', backgroundColor: 'rgba(226, 88, 34, 0.08)' },
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setSelectedBot(bot)}
                  >
                    <View style={styles.botCardTop}>
                      <View style={[styles.levelIndicatorDot, { backgroundColor: bot.themeColor }]} />
                      <View style={styles.botMetaCol}>
                        <View style={styles.botTitleRow}>
                          <Text style={styles.botNameText}>{bot.name}</Text>
                          <Text style={[styles.tierTagText, { color: bot.themeColor }]}>{bot.tier}</Text>
                        </View>
                        <Text style={styles.botPaceText}>
                          {bot.repsPerMinute} reps/min • ~{bot.estCaloriesPerMin * 2} kcal/duel
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 2. CHOOSE EXERCISE */}
            <Text style={styles.sectionLabel}>EXERCISE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exerciseRow}>
              {exercises.map((ex) => {
                const isSquat = ex.id === '1' || ex.name.toLowerCase().includes('squat');
                const isSelected = isSquat && chosenExerciseId === ex.id;

                return (
                  <TouchableOpacity
                    key={ex.id}
                    style={[
                      styles.exerciseChip,
                      isSelected && styles.exerciseChipActive,
                      !isSquat && { opacity: 0.45, borderColor: 'rgba(255, 255, 255, 0.05)' },
                    ]}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!isSquat) {
                        Alert.alert(
                          'Exercise Locked',
                          'Only Squats is currently supported in Human vs AI mode. Other exercises will be unlocked in upcoming updates.',
                          [{ text: 'OK' }]
                        );
                        return;
                      }
                      setChosenExerciseId(ex.id);
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text
                        style={[
                          styles.exerciseChipText,
                          isSelected && styles.exerciseChipTextActive,
                        ]}
                      >
                        {ex.name}
                      </Text>
                      {!isSquat && <Lock size={11} color="#94A3B8" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 3. MATCH METRICS */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Duration</Text>
                <Text style={styles.summaryValue}>2 Minutes</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>AI Pacing</Text>
                <Text style={styles.summaryValue}>{selectedBot.repsPerMinute} reps/min</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Estimated Energy</Text>
                <Text style={styles.summaryValueBurn}>~{estTotalCalories} kcal</Text>
              </View>
            </View>
          </ScrollView>

          {/* BOTTOM LAUNCH BUTTON */}
          <TouchableOpacity
            style={styles.startDuelBtn}
            activeOpacity={0.9}
            onPress={() => {
              onClose();
              onStartMatch(selectedBot, chosenExerciseId);
            }}
          >
            <Swords size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.startDuelBtnText}>
              START MATCH
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: '90%',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleGroup: {
    flex: 1,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  badgePillText: {
    color: '#E25822',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modalMainTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '900',
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    maxHeight: 460,
  },
  sectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginBottom: 10,
    marginTop: 10,
  },
  botGrid: {
    gap: 8,
  },
  botCard: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 12,
  },
  botCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  levelIndicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  botMetaCol: {
    flex: 1,
  },
  botTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botNameText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  tierTagText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  botPaceText: {
    color: colors.textMuted,
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  exerciseRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  exerciseChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  exerciseChipActive: {
    backgroundColor: '#E25822',
    borderColor: '#E25822',
  },
  exerciseChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  exerciseChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginTop: 14,
    marginBottom: 8,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  summaryValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  summaryValueBurn: {
    color: '#E25822',
    fontSize: 12,
    fontWeight: '900',
  },
  startDuelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E25822',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  startDuelBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
})
);
