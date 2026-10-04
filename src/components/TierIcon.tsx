import React from 'react';
import { RankEmblem, clampTier } from './RankEmblem';

// Ranking level (see LEVEL_TIERS in rankingService) shown as its custom rank emblem.
interface TierIconProps {
  level: number;
  size?: number;
  /** Kept for existing call sites; emblems carry their own tier colours. */
  color?: string;
}

export const TierIcon: React.FC<TierIconProps> = ({ level, size = 16 }) => (
  <RankEmblem tier={clampTier(level)} size={Math.round(size * 1.5)} />
);
