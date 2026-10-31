import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Radio } from 'lucide-react-native';
import { AIInstructor3D, AIInstructor3DHandle } from './AIInstructor3D';
import { AiInstructorMode, AiLoadoutItem } from '../aiInstructorHtml';
import type { AIBotState } from '../../../utils/aiBotService';
import { supabase } from '../../../utils/supabase';
import {
  BUNDLED_AVATARS,
  lookForName,
  lookOf,
  resolveModelUrl,
  viewerConfig,
} from '../../../utils/avatarShopService';

interface DuelOpponentViewProps {
  opponentUsername: string;
  /** A simulated rival (bot fallback): its look comes from its name, its reps from botState. */
  isSimulated: boolean;
  botState?: AIBotState | null;
  opponentScore: number;
  exerciseId: string;
  isMatchActive: boolean;
  isMatchEnded: boolean;
  opponentWon: boolean;
  /** Live moves (floating widget toggle): mirror the opponent's streamed pose. */
  live: boolean;
  /** The 3D opponent has loaded. */
  onReady?: () => void;
}

const REP_MS = 1300;
// Holds (triangle, cobra, child's, tree, warrior) score once a second: the rival keeps the pose while points arrive.
const HOLD_IDS = ['3', '6', '8', '9', '10'];
const HOLD_MS = 2500;

/** The 1v1 duel opponent in 3D, in their own shop look, like the AI in Human vs AI. */
export const DuelOpponentView = forwardRef<AIInstructor3DHandle, DuelOpponentViewProps>(
  ({ opponentUsername, isSimulated, botState, opponentScore, exerciseId, isMatchActive, isMatchEnded, opponentWon, live, onReady }, ref) => {
    // The bundled catalog has every character, face and outfit, so the look is known at once and
    // the 3D page is built once (a server catalog arriving later used to rebuild and reload it).
    const catalog = BUNDLED_AVATARS;
    const [profileLook, setProfileLook] = useState<{ equipped_avatar_id?: string | null; equipped_items?: any } | null>(null);

    useEffect(() => {
      let active = true;
      if (!isSimulated && opponentUsername) {
        supabase
          .from('profiles')
          .select('equipped_avatar_id, equipped_items')
          .eq('username', opponentUsername)
          .maybeSingle()
          .then(({ data }) => {
            if (active && data) setProfileLook(data);
          });
      }
      return () => {
        active = false;
      };
    }, [isSimulated, opponentUsername]);

    const look = useMemo(
      () => (!isSimulated && profileLook ? lookOf(catalog, profileLook as any) : lookForName(catalog, opponentUsername || 'rival')),
      [catalog, isSimulated, opponentUsername, profileLook],
    );
    // Wait for a real opponent's profile before building the page, so it loads their look once.
    const [profileTimedOut, setProfileTimedOut] = useState(false);
    useEffect(() => {
      const t = setTimeout(() => setProfileTimedOut(true), 2500);
      return () => clearTimeout(t);
    }, []);
    const lookReady = isSimulated || !!profileLook || profileTimedOut;

    const modelUrl = resolveModelUrl(look.model.model_url);
    const loadout: AiLoadoutItem[] = useMemo(
      () =>
        look.items.map((it) => {
          const c = viewerConfig(it, look.model);
          return {
            category: it.category,
            config: c.model_url ? { ...c, model_url: resolveModelUrl(c.model_url) } : c,
          } as AiLoadoutItem;
        }),
      [look],
    );

    // Real opponents: one rep per point they score (holds: in the pose while points keep coming).
    const [repProgress, setRepProgress] = useState<number>(0);
    const [repping, setRepping] = useState<boolean>(false);
    const lastScore = useRef<number>(opponentScore);
    useEffect(() => {
      if (isSimulated || opponentScore <= lastScore.current) {
        lastScore.current = opponentScore;
        return;
      }
      lastScore.current = opponentScore;
      const start = Date.now();
      setRepping(true);
      const dur = HOLD_IDS.includes(exerciseId) ? HOLD_MS : REP_MS;
      const t = setInterval(() => {
        const p = Math.min(1, (Date.now() - start) / dur);
        setRepProgress(p);
        if (p >= 1) {
          clearInterval(t);
          setRepping(false);
        }
      }, 50);
      return () => clearInterval(t);
    }, [opponentScore, isSimulated, exerciseId]);

    const isSquat = exerciseId === '1';
    let mode: AiInstructorMode = 'stand';
    let progress = 0;
    if (isMatchEnded) mode = opponentWon ? 'cheer' : 'stand';
    else if (isMatchActive) {
      const doing: AiInstructorMode = isSquat ? 'squat' : 'move';
      if (isSimulated && botState) {
        mode = botState.currentPhase === 'pause' ? 'rest' : doing;
        progress = botState.phaseProgress;
      } else if (repping) {
        mode = doing;
        progress = repProgress;
      } else if (!isSquat) {
        mode = 'rest';
      }
    }

    if (!lookReady) return <View style={styles.fill} />;
    return (
      <View style={styles.fill}>
        <AIInstructor3D
          ref={ref}
          mode={mode}
          exerciseId={exerciseId}
          phaseProgress={progress}
          modelUrl={modelUrl}
          loadout={loadout}
          live={live}
          label="Loading rival"
          onReady={onReady}
        />
        {live && (
          <View style={styles.liveChip} pointerEvents="none">
            <Radio size={12} color="#FFFFFF" />
            <Text style={styles.liveText}>LIVE MOVES</Text>
          </View>
        )}
      </View>
    );
  },
);
DuelOpponentView.displayName = 'DuelOpponentView';

const styles = StyleSheet.create({
  fill: { flex: 1, width: '100%', backgroundColor: '#0A0D14' },
  liveChip: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(239,68,68,0.85)',
  },
  liveText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
});
