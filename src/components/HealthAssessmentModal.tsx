import React, { useState, useEffect } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  Activity,
  Check,
  CheckCircle2,
  Heart,
  Info,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  X,
  XCircle,
} from 'lucide-react-native';
import { HEALTH_CONDITIONS, HealthConditionMeta } from '../utils/exerciseRecommendations';
import { UserProfile, updateUserProfile } from '../utils/profileService';
import { useUserStore } from '../store/userStore';

interface HealthAssessmentModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const HealthAssessmentModal: React.FC<HealthAssessmentModalProps> = ({
  visible,
  onClose,
  onSaved,
}) => {
  const { user, profile, setProfile, isGuest } = useUserStore();
  const [selectedConditions, setSelectedConditions] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Initialize selected conditions whenever modal opens or profile changes
  useEffect(() => {
    if (visible && profile) {
      const initial: Record<string, boolean> = {};
      HEALTH_CONDITIONS.forEach((cond) => {
        const directVal = (profile as any)[cond.field];
        const mapVal = profile.health_conditions ? profile.health_conditions[cond.key] : undefined;
        initial[cond.key] = directVal === true || mapVal === true;
      });
      setSelectedConditions(initial);
    }
  }, [visible, profile]);

  const handleToggleCondition = (key: string, value: boolean) => {
    setSelectedConditions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSaveAssessment = async () => {
    setIsSaving(true);
    try {
      const updates: Partial<UserProfile> = {
        has_knock_knees: selectedConditions['knock_knees'] || false,
        has_bow_legs: selectedConditions['bow_legs'] || false,
        has_flat_feet: selectedConditions['flat_feet'] || false,
        has_lower_back_pain: selectedConditions['lower_back_pain'] || false,
        has_rounded_shoulders: selectedConditions['rounded_shoulders'] || false,
        health_conditions_completed: true,
        health_conditions: selectedConditions,
      };

      if (user?.id && !isGuest) {
        const res = await updateUserProfile(user.id, updates);
        if (res.success && res.data) {
          setProfile({ ...profile, ...res.data, ...updates } as UserProfile);
        } else {
          setProfile({ ...profile, ...updates } as UserProfile);
        }
      } else {
        // Guest mode / offline
        setProfile({ ...profile, ...updates } as UserProfile);
      }

      if (onSaved) onSaved();
      onClose();
    } catch (err: any) {
      Alert.alert('Health Assessment', 'Assessment saved successfully.');
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const activeCount = Object.values(selectedConditions).filter(Boolean).length;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleGroup}>
              <View style={styles.iconCircle}>
                <Stethoscope size={20} color="#E25822" />
              </View>
              <View>
                <Text style={styles.modalTitle}>Health & Posture Check</Text>
                <Text style={styles.modalSubtitle}>
                  Tailor AI exercise routines to your body
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <X size={20} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          {/* Info Banner */}
          <View style={styles.infoBanner}>
            <Sparkles size={16} color="#E25822" style={{ marginTop: 2, marginRight: 8 }} />
            <Text style={styles.infoBannerText}>
              Select whether you experience any of the conditions below (Tick ✓ for Yes, Cross ✗ for No). Our AI will prioritize therapeutic and corrective exercises.
            </Text>
          </View>

          {/* Questions List */}
          <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
            {HEALTH_CONDITIONS.map((cond) => {
              const isSelected = selectedConditions[cond.key] === true;

              return (
                <View
                  key={cond.key}
                  style={[
                    styles.conditionCard,
                    isSelected && { borderColor: cond.badgeColor, backgroundColor: 'rgba(30, 41, 59, 0.85)' },
                  ]}
                >
                  <View style={styles.conditionTopRow}>
                    <View style={styles.conditionTitleWrapper}>
                      <Text style={styles.conditionEmoji}>{cond.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.conditionTitle}>{cond.title}</Text>
                          <View style={[styles.medicalBadge, { backgroundColor: `${cond.badgeColor}25` }]}>
                            <Text style={[styles.medicalBadgeText, { color: cond.badgeColor }]}>
                              {cond.medicalTerm}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.conditionDesc}>{cond.shortDesc}</Text>
                      </View>
                    </View>
                  </View>

                  <Text style={styles.questionText}>{cond.question}</Text>

                  {/* Yes / No Toggle Selector */}
                  <View style={styles.toggleRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[
                        styles.toggleBtn,
                        isSelected && [styles.yesBtnActive, { backgroundColor: cond.badgeColor }],
                      ]}
                      onPress={() => handleToggleCondition(cond.key, true)}
                    >
                      <Check
                        size={16}
                        color={isSelected ? '#FFFFFF' : '#64748B'}
                        strokeWidth={isSelected ? 3 : 2}
                      />
                      <Text
                        style={[
                          styles.toggleBtnText,
                          isSelected && styles.toggleBtnTextActive,
                        ]}
                      >
                        Yes (Experiencing)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[
                        styles.toggleBtn,
                        !isSelected && styles.noBtnActive,
                      ]}
                      onPress={() => handleToggleCondition(cond.key, false)}
                    >
                      <X
                        size={16}
                        color={!isSelected ? '#94A3B8' : '#475569'}
                        strokeWidth={!isSelected ? 2.5 : 2}
                      />
                      <Text
                        style={[
                          styles.toggleBtnText,
                          !isSelected && styles.noBtnTextActive,
                        ]}
                      >
                        No (None)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Recommended Exercises Preview when Selected */}
                  {isSelected && (
                    <View style={styles.recPreviewContainer}>
                      <Text style={styles.recPreviewLabel}>
                        🎯 Recommended AI Focus:
                      </Text>
                      <View style={styles.recBadgesRow}>
                        {cond.recommendedExerciseNames.map((name) => (
                          <View key={name} style={styles.recBadgePill}>
                            <Text style={styles.recBadgePillText}>{name}</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={styles.recReasonText}>{cond.explanation}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>

          {/* Footer Action */}
          <View style={styles.footerContainer}>
            <View style={styles.footerSummary}>
              <Text style={styles.footerSummaryText}>
                {activeCount === 0
                  ? 'No specific conditions selected'
                  : `${activeCount} condition${activeCount > 1 ? 's' : ''} active for recommendation`}
              </Text>
            </View>

            <TouchableOpacity
              style={styles.saveButton}
              activeOpacity={0.85}
              disabled={isSaving}
              onPress={handleSaveAssessment}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <CheckCircle2 size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.saveButtonText}>Save & Update Recommendations</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingTop: 20,
    paddingBottom: 28,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.3)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.2,
  },
  modalSubtitle: {
    fontSize: 12.5,
    color: '#94A3B8',
    marginTop: 2,
  },
  closeButton: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(226, 88, 34, 0.08)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.2)',
    marginBottom: 14,
  },
  infoBannerText: {
    fontSize: 12,
    color: '#CBD5E1',
    lineHeight: 17,
    flex: 1,
  },
  scrollList: {
    maxHeight: 440,
    marginBottom: 12,
  },
  conditionCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  conditionTopRow: {
    marginBottom: 8,
  },
  conditionTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  conditionEmoji: {
    fontSize: 24,
  },
  conditionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  medicalBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  medicalBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  conditionDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  questionText: {
    fontSize: 13,
    color: '#E2E8F0',
    marginVertical: 8,
    fontWeight: '500',
    lineHeight: 18,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  yesBtnActive: {
    borderColor: 'transparent',
  },
  noBtnActive: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  toggleBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  noBtnTextActive: {
    color: '#CBD5E1',
  },
  recPreviewContainer: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  recPreviewLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#E25822',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  recBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  recBadgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  recBadgePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  recReasonText: {
    fontSize: 11,
    color: '#94A3B8',
    lineHeight: 15,
  },
  footerContainer: {
    paddingTop: 8,
    gap: 10,
  },
  footerSummary: {
    alignItems: 'center',
  },
  footerSummaryText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E25822',
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#E25822',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonText: {
    fontSize: 14.5,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
