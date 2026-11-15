// Your own 3D character in a match: your equipped hero and look, copying your live pose like a mirror.
// It covers the camera view (which keeps tracking underneath and counts the reps). During setup it fills
// the screen under the get-ready HUD; in the match it fills your (left) half.
import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useEquippedLook } from '../../../hooks/useEquippedLook';
import { resolveModelUrl, viewerConfig } from '../../../utils/avatarShopService';
import { AiLoadoutItem } from '../aiInstructorHtml';
import { AIInstructor3D, AIInstructor3DHandle } from './AIInstructor3D';
import { mirror } from './PositionCheck';

export interface SelfCharacterHandle {
  /** A POSE_WORLD packet from the camera page (19 joints x 4). */
  pushPose: (p: number[]) => void;
}

export const SelfCharacterView = forwardRef<SelfCharacterHandle, { exerciseId: string }>(({ exerciseId }, ref) => {
  const look = useEquippedLook();
  const viewRef = useRef<AIInstructor3DHandle>(null);

  useImperativeHandle(ref, () => ({
    pushPose: (p) => {
      if (p.length === 76 && p.every((v) => Number.isFinite(v))) viewRef.current?.pushPose(mirror(p));
    },
  }));

  const modelUrl = resolveModelUrl(look.model.model_url);
  const loadout: AiLoadoutItem[] = useMemo(
    () =>
      look.items.map((it) => {
        const cfg = viewerConfig(it, look.model);
        return { category: it.category, config: cfg.model_url ? { ...cfg, model_url: resolveModelUrl(cfg.model_url) } : cfg } as AiLoadoutItem;
      }),
    [look],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {look.ready ? (
        <AIInstructor3D
          ref={viewRef}
          mode="stand"
          exerciseId={exerciseId}
          phaseProgress={0}
          modelUrl={modelUrl}
          loadout={loadout}
          live
          label="Loading your character"
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0A0D14' }]} />
      )}
    </View>
  );
});
SelfCharacterView.displayName = 'SelfCharacterView';
