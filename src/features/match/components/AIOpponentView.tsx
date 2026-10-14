import React from 'react';
import { AIBotProfile, AIBotState } from '../../../utils/aiBotService';
import { AIInstructor3D } from './AIInstructor3D';

interface AIOpponentViewProps {
  bot: AIBotProfile;
  botState?: AIBotState | null;
  exerciseId?: string;
  isMatchActive: boolean;
  /** The match is over: the 3D AI cheers if it won. */
  isMatchEnded?: boolean;
  /** The 3D opponent has loaded. */
  onReady?: () => void;
}

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

/** Human vs AI: the screen shows only the 3D instructor, doing the chosen exercise in step with the
 * bot's reps (or holds). Squats use the authored clip; every other exercise its built-in moves. */
export const AIOpponentView: React.FC<AIOpponentViewProps> = ({
  botState: rawBotState,
  exerciseId = '1',
  isMatchActive,
  isMatchEnded = false,
  onReady,
}) => {
  const botState = rawBotState || DEFAULT_BOT_STATE;
  const resting = botState.currentPhase === 'pause';
  const mode = isMatchEnded
    ? botState.isLeading ? 'cheer' : 'idle'
    : !isMatchActive ? 'idle'
    : resting ? 'rest'
    : exerciseId === '1' ? 'squat'
    : 'move';
  return <AIInstructor3D mode={mode} exerciseId={exerciseId} phaseProgress={botState.phaseProgress} onReady={onReady} />;
};
