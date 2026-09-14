export interface AIBotProfile {
  id: string;
  name: string;
  tagline: string;
  level: number;
  tier: 'Beginner' | 'Intermediate' | 'Advanced' | 'Pro';
  themeColor: string;
  baseRepSeconds: number; // Avg duration per rep
  repsPerMinute: number;
  formAccuracyPercent: number;
  pauseIntervalReps: number;
  pauseDurationSeconds: number;
  adaptiveAggression: number;
  estCaloriesPerMin: number;
  quotes: {
    greeting: string[];
    onRep: string[];
    whenLeading: string[];
    whenTrailing: string[];
    onWin: string[];
    onLoss: string[];
  };
}

export const AI_BOT_LEVELS: AIBotProfile[] = [
  {
    id: 'ai_bot_level_1',
    name: 'PulseBot',
    tagline: 'Casual pacing for beginners',
    level: 1,
    tier: 'Beginner',
    themeColor: '#38BDF8',
    baseRepSeconds: 4.2,
    repsPerMinute: 14,
    formAccuracyPercent: 86,
    pauseIntervalReps: 5,
    pauseDurationSeconds: 3.5,
    adaptiveAggression: 0.15,
    estCaloriesPerMin: 6,
    quotes: {
      greeting: ['Ready for the workout.', 'Starting beginner routine.'],
      onRep: ['Good rep.', 'Keep steady form.'],
      whenLeading: ['Steady pace.', 'Keep going.'],
      whenTrailing: ['Great speed.', 'Taking a breath.'],
      onWin: ['Good workout.', 'Finished routine.'],
      onLoss: ['You won the duel.', 'Great session.'],
    },
  },
  {
    id: 'ai_bot_level_2',
    name: 'Vortex AI',
    tagline: 'Balanced cadence & endurance',
    level: 2,
    tier: 'Intermediate',
    themeColor: '#C0C0C0',
    baseRepSeconds: 2.8,
    repsPerMinute: 22,
    formAccuracyPercent: 92,
    pauseIntervalReps: 8,
    pauseDurationSeconds: 2.0,
    adaptiveAggression: 0.45,
    estCaloriesPerMin: 9,
    quotes: {
      greeting: ['Cadence set to 22 reps/min.', 'Ready for match.'],
      onRep: ['Rep counted.', 'Form verified.'],
      whenLeading: ['Pace is steady.', 'Maintain rhythm.'],
      whenTrailing: ['Adjusting cadence.', 'Increasing speed.'],
      onWin: ['Match concluded.', 'Solid effort.'],
      onLoss: ['Well played.', 'Impressive endurance.'],
    },
  },
  {
    id: 'ai_bot_level_3',
    name: 'Titan Core',
    tagline: 'High tempo & stamina',
    level: 3,
    tier: 'Advanced',
    themeColor: '#F59E0B',
    baseRepSeconds: 1.9,
    repsPerMinute: 32,
    formAccuracyPercent: 96,
    pauseIntervalReps: 14,
    pauseDurationSeconds: 1.2,
    adaptiveAggression: 0.75,
    estCaloriesPerMin: 13,
    quotes: {
      greeting: ['High tempo protocol active.', 'Ready.'],
      onRep: ['Power rep.', 'Form locked.'],
      whenLeading: ['Pushing cadence.', 'Hold tempo.'],
      whenTrailing: ['Pace increasing.', 'Closing gap.'],
      onWin: ['Workout finished.', 'Strong session.'],
      onLoss: ['You won the match.', 'Great stamina.'],
    },
  },
  {
    id: 'ai_bot_level_4',
    name: 'Ojas Pro',
    tagline: 'Maximum speed & perfect form',
    level: 4,
    tier: 'Pro',
    themeColor: '#E25822',
    baseRepSeconds: 1.35,
    repsPerMinute: 44,
    formAccuracyPercent: 99,
    pauseIntervalReps: 25,
    pauseDurationSeconds: 0.8,
    adaptiveAggression: 0.98,
    estCaloriesPerMin: 18,
    quotes: {
      greeting: ['Maximum speed active.', 'Ready.'],
      onRep: ['Clean rep.', 'Optimal cadence.'],
      whenLeading: ['High intensity.', 'Keep up.'],
      whenTrailing: ['Maximum tempo.', 'Accelerating.'],
      onWin: ['Match complete.', 'High calorie burn.'],
      onLoss: ['You won the match.', 'Outstanding performance.'],
    },
  },
];

export interface AIBotState {
  score: number;
  formAccuracy: number;
  currentPhase: 'eccentric' | 'concentric' | 'pause' | 'hold';
  phaseProgress: number; // 0 to 1
  comboStreak: number;
  currentQuote: string;
  isLeading: boolean;
  leadDiff: number;
}

/**
 * Creates an intelligent runtime AI Bot that updates step-by-step
 * simulating realistic human biomechanical reps with fluid curves.
 */
export class AIBattleSimulation {
  public bot: AIBotProfile;
  public score: number = 0;
  public totalHoldSeconds: number = 0;
  public formAccuracy: number = 95;
  public phaseProgress: number = 0;
  public currentPhase: 'eccentric' | 'concentric' | 'pause' = 'eccentric';
  public comboStreak: number = 0;
  public currentQuote: string = '';

  private isHoldExercise: boolean = false;
  private lastTickMs: number = Date.now();
  private repElapsedSeconds: number = 0;
  private currentRepDuration: number = 3.0;
  private repsSinceLastPause: number = 0;
  private pauseRemainingSeconds: number = 0;
  private lastQuoteChangeSec: number = 0;

  constructor(bot: AIBotProfile, exerciseId?: string) {
    this.bot = bot;
    this.isHoldExercise = ['3', '6', '8'].includes(exerciseId || '1');
    this.currentRepDuration = this.bot.baseRepSeconds;
    this.currentQuote = this.bot.quotes.greeting[Math.floor(Math.random() * this.bot.quotes.greeting.length)];
  }

  public update(deltaSec: number, humanScore: number, matchTimeRemainingSec: number): {
    didScoreRep: boolean;
    state: AIBotState;
  } {
    let didScoreRep = false;

    // Adjust target rep speed adaptively based on human speed and bot aggression
    const diff = humanScore - this.score;
    let speedMultiplier = 1.0;

    if (diff > 0) {
      // Human is leading: Bot accelerates according to its adaptive aggression
      speedMultiplier = Math.max(0.75, 1.0 - (diff * 0.05 * this.bot.adaptiveAggression));
    } else if (diff < -3) {
      // Bot is comfortably ahead: ease up slightly on lower difficulty
      speedMultiplier = 1.0 + (Math.min(4, Math.abs(diff)) * 0.06 * (1.0 - this.bot.adaptiveAggression));
    }

    const effectiveRepDuration = Math.max(0.9, this.bot.baseRepSeconds * speedMultiplier);

    // Handle isometric hold exercises (Cobra Pose, Triangle Pose, Child's Pose)
    if (this.isHoldExercise) {
      this.totalHoldSeconds += deltaSec;
      if (Math.floor(this.totalHoldSeconds) > this.score) {
        this.score = Math.floor(this.totalHoldSeconds);
        this.comboStreak += 1;
        didScoreRep = true;
      }
      this.phaseProgress = (this.totalHoldSeconds % 5) / 5.0;
    } else {
      // Dynamic rep-based exercises (Squats, Push-ups, Sit-ups, Lunges, Crunches)
      if (this.pauseRemainingSeconds > 0) {
        this.pauseRemainingSeconds -= deltaSec;
        this.currentPhase = 'pause';
        this.phaseProgress = 1.0;
      } else {
        this.repElapsedSeconds += deltaSec;
        const progress = Math.min(1.0, this.repElapsedSeconds / effectiveRepDuration);
        this.phaseProgress = progress;

        if (progress < 0.5) {
          this.currentPhase = 'eccentric'; // going down
        } else {
          this.currentPhase = 'concentric'; // pushing up
        }

        if (this.repElapsedSeconds >= effectiveRepDuration) {
          this.repElapsedSeconds = 0;
          this.score += 1;
          this.comboStreak += 1;
          this.repsSinceLastPause += 1;
          didScoreRep = true;

          // Check if bot should take a short fatigue pause
          if (this.repsSinceLastPause >= this.bot.pauseIntervalReps) {
            this.repsSinceLastPause = 0;
            this.pauseRemainingSeconds = this.bot.pauseDurationSeconds * (0.8 + Math.random() * 0.4);
          }
        }
      }
    }

    // Dynamic dialogue selection every 12-18 seconds
    const matchElapsed = 120 - matchTimeRemainingSec;
    if (matchElapsed - this.lastQuoteChangeSec > 14) {
      this.lastQuoteChangeSec = matchElapsed;
      if (diff > 2 && this.bot.quotes.whenTrailing.length > 0) {
        this.currentQuote = this.bot.quotes.whenTrailing[Math.floor(Math.random() * this.bot.quotes.whenTrailing.length)];
      } else if (diff < -2 && this.bot.quotes.whenLeading.length > 0) {
        this.currentQuote = this.bot.quotes.whenLeading[Math.floor(Math.random() * this.bot.quotes.whenLeading.length)];
      } else if (this.bot.quotes.onRep.length > 0) {
        this.currentQuote = this.bot.quotes.onRep[Math.floor(Math.random() * this.bot.quotes.onRep.length)];
      }
    }

    // Slightly fluctuate form accuracy for realism
    this.formAccuracy = Math.min(100, Math.max(80, Math.round(this.bot.formAccuracyPercent + (Math.sin(matchElapsed * 0.8) * 3))));

    return {
      didScoreRep,
      state: {
        score: this.score,
        formAccuracy: this.formAccuracy,
        currentPhase: this.currentPhase,
        phaseProgress: this.phaseProgress,
        comboStreak: this.comboStreak,
        currentQuote: this.currentQuote,
        isLeading: this.score > humanScore,
        leadDiff: Math.abs(this.score - humanScore),
      },
    };
  }

  public getFinalQuote(isHumanWinner: boolean): string {
    if (isHumanWinner) {
      return this.bot.quotes.onLoss[Math.floor(Math.random() * this.bot.quotes.onLoss.length)];
    }
    return this.bot.quotes.onWin[Math.floor(Math.random() * this.bot.quotes.onWin.length)];
  }
}

export function getBotByLevel(level: number): AIBotProfile {
  const found = AI_BOT_LEVELS.find((b) => b.level === level);
  return found || AI_BOT_LEVELS[0];
}

export function getBotByName(name: string): AIBotProfile | undefined {
  return AI_BOT_LEVELS.find(
    (b) => b.name.toLowerCase() === name.toLowerCase() || b.id.toLowerCase() === name.toLowerCase()
  );
}
