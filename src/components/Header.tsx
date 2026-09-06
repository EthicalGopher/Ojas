import React, { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bell, Flame } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { useMatchmakingStore } from '../store/matchmakingStore';
import { useUserStore } from '../store/userStore';

export interface HeaderProps {
  title?: string;
  username?: string;
  onlineCount?: number;
  onProfilePress?: () => void;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  username: propUsername,
  onlineCount: propOnlineCount,
  onProfilePress,
  leftAction,
  rightAction,
}) => {
  const storeOnline = useMatchmakingStore((state) => state.total_online);
  const { profile, user, setActiveTab } = useUserStore();

  const activeUsername =
    propUsername ||
    profile?.username ||
    profile?.full_name ||
    user?.user_metadata?.username ||
    user?.email?.split('@')[0] ||
    'James';

  const avatarConfig = profile?.avatar_config;
  const avatarUrl = profile?.avatar_url;
  const displayOnlineCount = propOnlineCount !== undefined ? propOnlineCount : storeOnline;

  const handleProfilePress = () => {
    if (onProfilePress) {
      onProfilePress();
    } else {
      setActiveTab('profile');
    }
  };

  const fitnessGoal =
    profile?.fitness_goal ||
    user?.user_metadata?.fitness_goal ||
    'Fitness Freak';

  const leftContent = leftAction ?? (
    <TouchableOpacity
      style={styles.profileHeaderRow}
      activeOpacity={0.8}
      onPress={handleProfilePress}
    >
      <View style={styles.avatarBorder}>
        <Avatar
          username={activeUsername}
          size={42}
          config={avatarConfig}
          avatarUrl={avatarUrl}
        />
      </View>
      <View style={styles.nameTextBox}>
        <Text style={styles.greetingText} numberOfLines={1}>
          {activeUsername.toUpperCase()}
        </Text>
        <View style={styles.statusRow}>
          <Flame size={12} color="#E8D5C4" style={{ marginRight: 3 }} />
          <Text style={styles.subtitleText} numberOfLines={1}>
            {fitnessGoal}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const defaultRightAction = (
    <View style={styles.onlinePillBadge}>
      <Text style={styles.onlineCountText}>{displayOnlineCount}</Text>
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
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    backgroundColor: '#1A1C20',
  },
  leftSlot: {
    flex: 1,
    alignItems: 'flex-start',
  },
  rightSlot: {
    alignItems: 'flex-end',
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBorder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E232B',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  nameTextBox: {
    marginLeft: 12,
  },
  greetingText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  subtitleText: {
    color: '#9CA3AF',
    fontSize: 11,
    fontWeight: '600',
  },
  centerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  onlinePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#181D26',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    gap: 6,
  },
  onlineDotIndicator: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#E25822',
  },
  onlineCountText: {
    color: '#E25822',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
