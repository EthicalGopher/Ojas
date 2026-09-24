import React, { ReactNode, useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, Flame } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { ProgressRing } from './ui/ProgressRing';
import { useMatchmakingStore } from '../store/matchmakingStore';
import { useUserStore } from '../store/userStore';
import { useGameStats } from '../hooks/useGameStats';
import { colors, radius } from '../theme';
import { selectUnreadCount, useNewsStore } from '../store/newsStore';

export interface HeaderProps {
  title?: string;
  username?: string;
  onlineCount?: number;
  onProfilePress?: () => void;
  onNewsPress?: () => void;
  unreadNews?: number;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  username: propUsername,
  onlineCount: propOnlineCount,
  onProfilePress,
  onNewsPress,
  unreadNews: propUnreadNews,
  leftAction,
  rightAction,
}) => {
  const storeOnline = useMatchmakingStore((state) => state.total_online);
  const { profile, user, setActiveTab, isGuest } = useUserStore();
  const { level, streak } = useGameStats();
  const storeUnread = useNewsStore(selectUnreadCount);
  const openNews = useUserStore((s) => s.openNews);
  const unreadNews = propUnreadNews ?? storeUnread;

  const activeUsername =
    propUsername ||
    profile?.username ||
    profile?.full_name ||
    user?.user_metadata?.username ||
    user?.email?.split('@')[0] ||
    'Guest Athlete';

  const displayOnlineCount = propOnlineCount !== undefined ? propOnlineCount : storeOnline;

  // Flame "breathes" while the streak is at risk to nudge a workout today.
  const flamePulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!streak.atRisk) {
      flamePulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(flamePulse, { toValue: 1.18, duration: 600, useNativeDriver: true }),
        Animated.timing(flamePulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [streak.atRisk, flamePulse]);

  const handleProfilePress = () => {
    if (isGuest || !onProfilePress) {
      setActiveTab('profile');
      return;
    }
    onProfilePress();
  };

  const leftContent = leftAction ?? (
    <TouchableOpacity style={styles.profileRow} activeOpacity={0.8} onPress={handleProfilePress}>
      <View>
        <ProgressRing size={50} strokeWidth={3.5} progress={level.progress}>
          <Avatar
            username={activeUsername}
            size={40}
            config={profile?.avatar_config}
            avatarUrl={profile?.avatar_url}
          />
        </ProgressRing>
        <View style={styles.levelBadgeRow} pointerEvents="none">
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{level.level}</Text>
          </View>
        </View>
      </View>

      <View style={styles.nameBox}>
        <Text style={styles.nameText} numberOfLines={1}>
          {activeUsername}
        </Text>
        <View style={styles.xpRow}>
          <Text style={styles.titleText}>{level.title}</Text>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${Math.max(4, level.progress * 100)}%` }]} />
          </View>
          <Text style={styles.xpText}>
            {level.xpIntoLevel}/{level.xpForNextLevel}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const defaultRightAction = (
    <View style={styles.rightGroup}>
      <View style={[styles.streakChip, streak.atRisk && styles.streakChipRisk, streak.activeToday && styles.streakChipLit]}>
        <Animated.View style={{ transform: [{ scale: flamePulse }] }}>
          <Flame
            size={16}
            color={streak.activeToday ? colors.flame : streak.atRisk ? colors.gold : colors.textDim}
            fill={streak.activeToday ? colors.flame : 'transparent'}
          />
        </Animated.View>
        <Text style={[styles.streakText, !streak.activeToday && !streak.atRisk && { color: colors.textDim }]}>
          {streak.current}
        </Text>
      </View>

      {!isGuest && (
        <TouchableOpacity style={styles.bellBtn} activeOpacity={0.8} onPress={onNewsPress ?? openNews}>
          <Bell size={18} color={colors.text} />
          {unreadNews > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadNews > 9 ? '9+' : unreadNews}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {!isGuest && displayOnlineCount > 0 && (
        <View style={styles.onlineDotWrap}>
          <View style={styles.onlineDot} />
          <Text style={styles.onlineText}>{displayOnlineCount}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.header}>
      <View style={styles.leftSlot}>{leftContent}</View>
      {title ? <Text style={styles.centerTitle}>{title}</Text> : null}
      <View style={styles.rightSlot}>{rightAction ?? defaultRightAction}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  leftSlot: { flex: 1, alignItems: 'flex-start', marginRight: 8 },
  rightSlot: { alignItems: 'flex-end' },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  // Absolute full-width row + alignItems centers the badge on every platform
  // (alignSelf on an absolute child is ignored on Android).
  levelBadgeRow: { position: 'absolute', left: 0, right: 0, bottom: -3, alignItems: 'center' },
  levelBadge: {
    minWidth: 22,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  levelBadgeText: { color: colors.onAccent, fontSize: 10, fontWeight: '900' },
  nameBox: { marginLeft: 12, flexShrink: 1 },
  nameText: { color: colors.text, fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
  xpRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 },
  titleText: { color: colors.accent, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase' },
  xpTrack: { width: 64, height: 6, borderRadius: 3, backgroundColor: colors.surfaceHi, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
  xpText: { color: colors.textDim, fontSize: 9.5, fontWeight: '800' },
  centerTitle: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  rightGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  streakChipLit: { backgroundColor: 'rgba(226, 88, 34, 0.14)', borderColor: 'rgba(226, 88, 34, 0.45)' },
  streakChipRisk: { backgroundColor: 'rgba(245, 158, 11, 0.1)', borderColor: 'rgba(245, 158, 11, 0.45)' },
  streakText: { color: colors.text, fontSize: 14, fontWeight: '900' },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },
  onlineDotWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  onlineText: { color: colors.success, fontSize: 11, fontWeight: '900' },
});
