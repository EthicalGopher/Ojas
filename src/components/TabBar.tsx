import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Dumbbell, Home, Activity, Users, User } from 'lucide-react-native';

export type TabBarItem = 'home' | 'explore' | 'workouts' | 'social' | 'profile';

interface TabBarProps {
  activeTab: TabBarItem;
  onTabPress: (tab: TabBarItem) => void;
  onProfilePress: () => void;
}

const COLORS = {
  pill: '#FDFDFC',
  inactiveBg: '#F1F1F0',
  activeBg: '#C9BEF0',
  activeIcon: '#211D2E',
  inactiveIcon: '#80838C',
};

// Measured off the reference screenshot (then scaled down to real UI size).
// The shape is three layers, not one:
//  - a flat connecting STRIP running the full width (this is the pinched
//    "waist" you see between icons)
//  - a wider BUMP circle per tab, same color as the strip, that puffs out
//    above and below it — this is what makes the scalloped edge
//  - a smaller ICON circle inset inside each bump, with real gaps between
//    adjacent icon circles (not touching, unlike my last attempt)
const SLOT = 64;   // distance between tab centers
const BUMP = 58;   // diameter of the puffed white circle behind each tab
const BASE_H = 42; // height of the flat strip connecting the bumps
const ICON = 50;   // diameter of the actual colored, tappable icon circle

const TAB_ITEMS = [
  { key: 'home' as const, icon: Home },
  { key: 'explore' as const, icon: Users },
  { key: 'workouts' as const, icon: Dumbbell },
  { key: 'profile' as const, icon: User },
];

const CONTAINER_WIDTH = (TAB_ITEMS.length - 1) * SLOT + BUMP;

interface TabButtonProps {
  isActive: boolean;
  index: number;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ isActive, index, Icon, onPress }) => {
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
          isActive ? styles.iconButtonActive : styles.iconButtonInactive,
          { transform: [{ scale }] },
        ]}
      >
        <Icon
          size={20}
          color={isActive ? COLORS.activeIcon : COLORS.inactiveIcon}
          strokeWidth={isActive ? 2.5 : 2}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

export const TabBar: React.FC<TabBarProps> = ({ activeTab, onTabPress, onProfilePress }) => {
  const handlePress = (key: TabBarItem) => {
    if (key === 'profile') {
      onProfilePress();
    } else {
      onTabPress(key);
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
            index={index}
            Icon={item.icon}
            onPress={() => handlePress(item.key)}
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
});