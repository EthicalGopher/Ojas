import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Svg, Line, Circle, Rect } from 'react-native-svg';
import { Bot, Cpu, Sparkles, Zap, Flame, Shield, Target } from 'lucide-react-native';
import { AIBotProfile, AIBotState } from '../../../utils/aiBotService';

interface AIOpponentViewProps {
  bot: AIBotProfile;
  botState?: AIBotState | null;
  exerciseId?: string;
  isMatchActive: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DEFAULT_BOT_STATE: AIBotState = {
  score: 0,
  formAccuracy: 95,
  currentPhase: 'eccentric',
  phaseProgress: 0,
  comboStreak: 0,
  currentQuote: 'Engine Ready',
  isLeading: false,
  leadDiff: 0,
};

export const AIOpponentView: React.FC<AIOpponentViewProps> = ({
  bot,
  botState: rawBotState,
  exerciseId = '1',
  isMatchActive,
}) => {
  const botState = rawBotState || DEFAULT_BOT_STATE;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ])
    ).start();

    Animated.loop(
      Animated.timing(scanLineAnim, { toValue: 1, duration: 2500, useNativeDriver: true })
    ).start();
  }, [pulseAnim, scanLineAnim]);

  // Compute kinematic joint coordinates for the cyber wireframe avatar based on exercise & phase
  const renderCyberSkeleton = () => {
    const p = botState.phaseProgress; // 0 to 1
    // Smooth sinusoidal motion: 0 (standing) -> 1 (deep rep) -> 0 (standing)
    const sinProgress = Math.sin(p * Math.PI);

    const w = 240;
    const h = 260;
    const centerX = w / 2;

    let headX = centerX;
    let headY = 40 + sinProgress * 45;
    let shoulderY = headY + 28;
    let hipY = shoulderY + 50 + sinProgress * 25;
    let kneeY = hipY + 45 + sinProgress * 15;
    let ankleY = h - 25;

    let leftKneeX = centerX - 25 - sinProgress * 12;
    let rightKneeX = centerX + 25 + sinProgress * 12;
    let leftAnkleX = centerX - 25;
    let rightAnkleX = centerX + 25;

    let leftHandX = centerX - 35;
    let rightHandX = centerX + 35;
    let leftHandY = shoulderY + 30 - sinProgress * 20;
    let rightHandY = shoulderY + 30 - sinProgress * 20;

    // Handle horizontal pushup / crunch exercises
    if (['2', '5', '7'].includes(exerciseId)) {
      // Horizontal plane
      headX = 45;
      headY = 110 - sinProgress * 25;
      shoulderY = 120 - sinProgress * 20;
      hipY = 145 + sinProgress * 10;
      kneeY = 165;
      ankleY = 175;
      leftKneeX = 140;
      rightKneeX = 145;
      leftAnkleX = 200;
      rightAnkleX = 205;
      leftHandX = 65;
      rightHandX = 65;
      leftHandY = 160;
      rightHandY = 160;
    }

    const theme = bot.themeColor;
    const glowStroke = bot.level >= 4 ? '#E25822' : theme;

    return (
      <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={styles.skeletonSvg}>
        {/* Neon Cyber Coordinate Grid */}
        <Line x1="10" y1={h / 2} x2={w - 10} y2={h / 2} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />
        <Line x1={centerX} y1="10" x2={centerX} y2={h - 10} stroke="rgba(255,255,255,0.06)" strokeDasharray="4 4" />

        {/* Torso & Limbs */}
        <Line x1={centerX} y1={shoulderY} x2={centerX} y2={hipY} stroke={glowStroke} strokeWidth="4" />
        {/* Shoulders */}
        <Line x1={centerX - 30} y1={shoulderY} x2={centerX + 30} y2={shoulderY} stroke={glowStroke} strokeWidth="3.5" />
        {/* Arms */}
        <Line x1={centerX - 30} y1={shoulderY} x2={leftHandX} y2={leftHandY} stroke={glowStroke} strokeWidth="3" />
        <Line x1={centerX + 30} y1={shoulderY} x2={rightHandX} y2={rightHandY} stroke={glowStroke} strokeWidth="3" />
        {/* Hips */}
        <Line x1={centerX - 20} y1={hipY} x2={centerX + 20} y2={hipY} stroke={glowStroke} strokeWidth="3.5" />
        {/* Left Leg */}
        <Line x1={centerX - 20} y1={hipY} x2={leftKneeX} y2={kneeY} stroke={glowStroke} strokeWidth="3.5" />
        <Line x1={leftKneeX} y1={kneeY} x2={leftAnkleX} y2={ankleY} stroke={glowStroke} strokeWidth="3.5" />
        {/* Right Leg */}
        <Line x1={centerX + 20} y1={hipY} x2={rightKneeX} y2={kneeY} stroke={glowStroke} strokeWidth="3.5" />
        <Line x1={rightKneeX} y1={kneeY} x2={rightAnkleX} y2={ankleY} stroke={glowStroke} strokeWidth="3.5" />

        {/* Joint Nodes */}
        <Circle cx={headX} cy={headY} r="14" fill="rgba(17, 20, 26, 0.85)" stroke={glowStroke} strokeWidth="2.5" />
        <Circle cx={headX} cy={headY} r="4" fill={glowStroke} />
        
        <Circle cx={centerX - 30} cy={shoulderY} r="4.5" fill={glowStroke} />
        <Circle cx={centerX + 30} cy={shoulderY} r="4.5" fill={glowStroke} />
        <Circle cx={leftHandX} cy={leftHandY} r="4" fill="#FFFFFF" />
        <Circle cx={rightHandX} cy={rightHandY} r="4" fill="#FFFFFF" />

        <Circle cx={centerX - 20} cy={hipY} r="4.5" fill={glowStroke} />
        <Circle cx={centerX + 20} cy={hipY} r="4.5" fill={glowStroke} />
        <Circle cx={leftKneeX} cy={kneeY} r="5" fill="#FFFFFF" stroke={glowStroke} strokeWidth="2" />
        <Circle cx={rightKneeX} cy={kneeY} r="5" fill="#FFFFFF" stroke={glowStroke} strokeWidth="2" />
        <Circle cx={leftAnkleX} cy={ankleY} r="4.5" fill={glowStroke} />
        <Circle cx={rightAnkleX} cy={ankleY} r="4.5" fill={glowStroke} />
      </Svg>
    );
  };

  const translateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 260],
  });

  return (
    <View style={styles.container}>
      {/* Background Matrix HUD Grid */}
      <View style={styles.gridOverlay} />

      {/* Top AI Bot Identity Banner */}
      <View style={[styles.aiHeaderCard, { borderColor: 'rgba(255, 255, 255, 0.1)' }]}>
        <View style={styles.aiAvatarWrapper}>
          <View style={[styles.aiAvatarCircle, { backgroundColor: '#1E293B' }]}>
            <Bot size={20} color="#E25822" />
          </View>
          <View style={styles.aiOnlineDot} />
        </View>

        <View style={styles.aiInfoCol}>
          <View style={styles.aiTitleRow}>
            <Text style={styles.aiBotName}>{bot.name}</Text>
            <View style={[styles.tierBadge, { backgroundColor: 'rgba(255, 255, 255, 0.1)' }]}>
              <Text style={[styles.tierBadgeText, { color: bot.themeColor }]}>{bot.tier}</Text>
            </View>
          </View>
          <Text style={styles.aiBotTier}>{bot.repsPerMinute} reps/min target</Text>
        </View>
      </View>

      {/* Center Hologram Wireframe Simulator */}
      <View style={styles.skeletonContainer}>
        {renderCyberSkeleton()}

        {/* Laser Scanning Bar */}
        {isMatchActive && (
          <Animated.View style={[styles.scanLaser, { transform: [{ translateY }] }]} />
        )}

        {/* Live Cadence Telemetry Badge */}
        <View style={styles.cadencePill}>
          <Cpu size={12} color="#38BDF8" style={{ marginRight: 4 }} />
          <Text style={styles.cadenceText}>
            {botState.currentPhase.toUpperCase()} • {Math.round(botState.phaseProgress * 100)}%
          </Text>
        </View>
      </View>

      {/* Live AI Speech Bubble (Short & Clean) */}
      {botState.currentQuote ? (
        <Animated.View style={[styles.speechBubble, { transform: [{ scale: pulseAnim }] }]}>
          <Bot size={13} color="#E25822" style={{ marginRight: 6 }} />
          <Text style={styles.speechText} numberOfLines={1}>
            {botState.currentQuote}
          </Text>
        </Animated.View>
      ) : null}

      {/* Bottom Telemetry HUD */}
      <View style={styles.telemetryRow}>
        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryLabel}>EST. CALORIES</Text>
          <Text style={[styles.telemetryValue, { color: '#E25822' }]}>
            {Math.max(0, Math.round(botState.score * (bot.estCaloriesPerMin / Math.max(1, bot.repsPerMinute))))} kcal
          </Text>
        </View>

        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryLabel}>AI PACE</Text>
          <Text style={styles.telemetryValue}>{bot.repsPerMinute} RPM</Text>
        </View>

        <View style={styles.telemetryCard}>
          <Text style={styles.telemetryLabel}>FORM</Text>
          <Text style={styles.telemetryValue}>{botState.formAccuracy}%</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0D14',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  aiHeaderCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 20, 26, 0.94)',
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
  },
  aiAvatarWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  aiAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  aiAvatarEmoji: {
    fontSize: 22,
  },
  aiOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#11141A',
  },
  aiInfoCol: {
    flex: 1,
  },
  aiTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiBotName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tierBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  aiBotTier: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  skeletonContainer: {
    width: 240,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(17, 20, 26, 0.6)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  skeletonSvg: {
    position: 'absolute',
  },
  scanLaser: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#E25822',
    shadowColor: '#E25822',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  cadencePill: {
    position: 'absolute',
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(11, 15, 25, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  cadenceText: {
    color: '#38BDF8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  speechBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 20, 26, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.4)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 8,
  },
  speechText: {
    color: '#F8FAFC',
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
    fontStyle: 'italic',
  },
  telemetryRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 6,
  },
  telemetryCard: {
    flex: 1,
    backgroundColor: 'rgba(17, 20, 26, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  telemetryLabel: {
    color: '#64748B',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  telemetryValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '900',
  },
});
