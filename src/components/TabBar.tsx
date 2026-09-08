import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View, Alert } from 'react-native';
import { Dumbbell, Home, Activity, Users, User, Lock } from 'lucide-react-native';

export type TabBarItem = 'home' | 'explore' | 'workouts' | 'social' | 'profile';

interface TabBarProps {
  activeTab: TabBarItem;
  onTabPress: (tab: TabBarItem) => void;
  onProfilePress: () => void;
  isGuest?: boolean;
  onRequireAuth?: () => void;
}

const COLORS = {
  pill: '#FDFDFC',
  inactiveBg: '#F1F1F0',
  activeBg: '#C9BEF0',
  activeIcon: '#211D2E',
  inactiveIcon: '#80838C',
  lockedIcon: '#94A3B8',
  lockedBg: '#E2E8F0',
};

// Measured off the reference screenshot (then scaled down to real UI size).
const SLOT = 64;   // distance between tab centers
const BUMP = 58;   // diameter of the puffed white circle behind each tab
const BASE_H = 42; // height of the flat strip connecting the bumps
const ICON = 50;   // diameter of the actual colored, tappable icon circle

const TAB_ITEMS = [
  { key: 'home' as const, icon: Home, requiresAuth: false },
  { key: 'explore' as const, icon: Users, requiresAuth: true },
  { key: 'workouts' as const, icon: Dumbbell, requiresAuth: true },
  { key: 'profile' as const, icon: User, requiresAuth: true },
];

const CONTAINER_WIDTH = (TAB_ITEMS.length - 1) * SLOT + BUMP;

interface TabButtonProps {
  isActive: boolean;
  isLocked: boolean;
  index: number;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ isActive, isLocked, index, Icon, onPress }) => {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: isActive ? 1.08 : 1,
      useNativeDriver: true,
      friction: 6,
      tension: 90,
    }).start();
  }, [isActive, scale]);

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onPress}
      style={[
        styles.iconTouchable,
        { left: index * SLOT + (BUMP - ICON) / 2, top: (BUMP - ICON) / 2 },
      ]}
    >
      <Animated.View
        style={[
          styles.iconButton,
          isLocked
            ? styles.iconButtonLocked
            : isActive
            ? styles.iconButtonActive
            : styles.iconButtonInactive,
          { transform: [{ scale }] },
        ]}
      >
        <Icon
          size={20}
          color={isLocked ? COLORS.lockedIcon : isActive ? COLORS.activeIcon : COLORS.inactiveIcon}
          strokeWidth={isActive ? 2.5 : 2}
        />
        {isLocked && (
          <View style={styles.lockBadge}>
            <Lock size={10} color="#64748B" strokeWidth={2.5} />
          </View>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

export const TabBar: React.FC<TabBarProps> = ({
  activeTab,
  onTabPress,
  onProfilePress,
  isGuest = false,
  onRequireAuth,
}) => {
  const handlePress = (item: typeof TAB_ITEMS[0]) => {
    if (isGuest && item.requiresAuth) {
      if (onRequireAuth) {
        onRequireAuth();
      } else {
        Alert.alert(
          '🔒 Account Required',
          'Sign in or create a free athlete account to unlock online community duels, profiles, and ranked leaderboards.',
          [{ text: 'OK' }]
        );
      }
      return;
    }

    if (item.key === 'profile') {
      onProfilePress();
    } else {
      onTabPress(item.key);
    }
  };

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <View style={styles.pillContainer}>
        <View style={styles.baseStrip} />

        {TAB_ITEMS.map((_, index) => (
          <View key={`bump-${index}`} style={[styles.bump, { left: index * SLOT }]} />
        ))}

        {TAB_ITEMS.map((item, index) => (
          <TabButton
            key={item.key}
            isActive={activeTab === item.key}
            isLocked={isGuest && item.requiresAuth}
            index={index}
            Icon={item.icon}
            onPress={() => handlePress(item)}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 70,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillContainer: {
    width: CONTAINER_WIDTH,
    height: BUMP,
  },
  baseStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: (BUMP - BASE_H) / 2,
    height: BASE_H,
    borderRadius: BASE_H / 2,
    backgroundColor: COLORS.pill,
  },
  bump: {
    position: 'absolute',
    top: 0,
    width: BUMP,
    height: BUMP,
    borderRadius: BUMP / 2,
    backgroundColor: COLORS.pill,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  iconTouchable: {
    position: 'absolute',
  },
  iconButton: {
    width: ICON,
    height: ICON,
    borderRadius: ICON / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonInactive: {
    backgroundColor: COLORS.inactiveBg,
  },
  iconButtonActive: {
    backgroundColor: COLORS.activeBg,
  },
  iconButtonLocked: {
    backgroundColor: COLORS.lockedBg,
    opacity: 0.65,
  },
  lockBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
});