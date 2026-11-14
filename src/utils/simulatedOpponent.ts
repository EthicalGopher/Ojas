import { AIBotProfile } from './aiBotService';

/**
 * A matchmaking stand-in shown when no real athlete is in the queue. The opponent's reps are
 * driven by an AIBattleSimulation (see `bot`), but it is presented like any other player.
 */
export interface SimulatedOpponent {
  username: string;
  bot: AIBotProfile;
  /** Displayed athlete level, kept close to the player's own. */
  level: number;
}

const FIRST_NAMES = [
  'aarav', 'vihaan', 'arjun', 'kabir', 'rohan', 'ishaan', 'aditya', 'kunal', 'rahul', 'dev',
  'ananya', 'priya', 'diya', 'isha', 'kavya', 'meera', 'riya', 'sneha', 'tara', 'nisha',
  'sam', 'alex', 'jordan', 'maya', 'leo', 'zara', 'noah', 'emma', 'ryan', 'sara',
];



const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)];

/** Builds a plausible player handle like `priya_fit21`, `arjun.lifts` or `kavya2004`. */
export function generateOpponentUsername(): string {
  const name = pick(FIRST_NAMES);
  const year = String(1995 + Math.floor(Math.random() * 12));
  const shortNum = String(Math.floor(1 + Math.random() * 98));

  switch (Math.floor(Math.random() * 2)) {
    case 0:
      return `${name}_${shortNum}`;
    case 1:
      return `${name}${year}`;
    default:
      return `${name}`;
  }
}

export function createSimulatedOpponent(bot: AIBotProfile, playerLevel: number = 1): SimulatedOpponent {
  const level = Math.max(1, playerLevel + Math.floor(Math.random() * 4) - 1);
  return { username: generateOpponentUsername(), bot, level };
}
