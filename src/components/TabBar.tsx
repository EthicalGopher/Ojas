import React, { useEffect, useRef } from 'react';
import { Alert, Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dumbbell, Home, Lock, User, Users } from 'lucide-react-native';
import { makeStyles, radius, shadow, ThemeColors, useColors } from '../theme';

export type TabBarItem = 'home' | 'explore' | 'workouts' | 'social' | 'profile';

interface TabBarProps {
  activeTab: TabBarItem;
  onTabPress: (tab: TabBarItem) => void;
  onProfilePress: () => void;
  isGuest?: boolean;
  onRequireAuth?: () => void;
}

const TAB_ITEMS = [
  { key: 'home' as const, label: 'Home', icon: Home, requiresAuth: false },
  { key: 'explore' as const, label: 'Squad', icon: Users, requiresAuth: true },
  { key: 'workouts' as const, label: 'Train', icon: Dumbbell, requiresAuth: true },
  { key: 'profile' as const, label: 'Me', icon: User, requiresAuth: true },
];

interface TabButtonProps {
  label: string;
  isActive: boolean;
  isLocked: boolean;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ label, isActive, isLocked, Icon, onPress }) => {
  const colors = useColors();
  const styles = useStyles();
  const anim = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: isActive ? 1 : 0,
      useNativeDriver: false,
      friction: 7,
      tension: 80,
    }).start();
  }, [isActive, anim]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: [48, 104] });
  const labelOpacity = anim.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress}>
      <Animated.View style={[styles.tab, isActive && styles.tabActive, { width }]}>
        <Icon
          size={20}
          color={isLocked ? colors.textDim : isActive ? colors.onAccent : colors.textMuted}
          strokeWidth={isActive ? 2.6 : 2}
        />
        {isActive && (
          <Animated.Text style={[styles.tabLabel, { opacity: labelOpacity }]} numberOfLines={1}>
            {label}
          </Animated.Text>
        )}
        {isLocked && (
          <View style={styles.lockBadge}>
            <Lock size={8} color={colors.textOnLight} strokeWidth={3} />
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
  const colors = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  const handlePress = (item: (typeof TAB_ITEMS)[number]) => {
    if (isGuest && item.requiresAuth) {
      if (onRequireAuth) {
        onRequireAuth();
      } else {
        Alert.alert(
          'Account Required',
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
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 12) + 10 }]} pointerEvents="box-none">
      <View style={styles.dock}>
        {TAB_ITEMS.map((item) => (
          <TabButton
            key={item.key}
            label={item.label}
            isActive={activeTab === item.key || (item.key === 'profile' && activeTab === 'social')}
            isLocked={isGuest && item.requiresAuth}
            Icon={item.icon}
            onPress={() => handlePress(item)}
          />
        ))}
      </View>
    </View>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  dock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    ...shadow(14),
  },
  tab: {
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabLabel: {
    color: colors.onAccent,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  lockBadge: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
);
