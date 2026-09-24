import React from 'react';
import { Award, Crown, Gem, Medal, Shield, Zap } from 'lucide-react-native';

// One icon per ranking level (see LEVEL_TIERS in rankingService), used instead of emoji badges.
const TIER_ICONS = [Shield, Medal, Award, Gem, Crown, Zap];

interface TierIconProps {
  level: number;
  size?: number;
  color: string;
}

export const TierIcon: React.FC<TierIconProps> = ({ level, size = 16, color }) => {
  const Icon = TIER_ICONS[Math.min(TIER_ICONS.length, Math.max(1, level)) - 1];
  return <Icon size={size} color={color} />;
};
