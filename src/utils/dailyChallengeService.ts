import { ExerciseItem } from './exerciseService';
import { UserProfile } from './profileService';
import { HEALTH_CONDITIONS, HealthConditionMeta } from './exerciseRecommendations';
import { ExerciseLiveStats } from '../store/dailyChallengeStore';
import { toDateKey } from './gamification';

export interface DailyChallenge {
  id: string;
  exerciseId: string;
  exerciseName: string;
  exercise: ExerciseItem;
  title: string;
  shortGoal: string;
  description: string;
  targetType: 'reps' | 'hold_seconds';
  targetValue: number;
  currentProgress: number;
  isCompleted: boolean;
  isAiVerified?: boolean;
  illnessKey?: string;
  illnessTitle?: string;
  cureBenefit: string;
  badgeColor: string;
  xpReward: number;
  calorieReward: number;
  category: string;
}

export interface DailyChallengeSummary {
  date: string;
  challenges: DailyChallenge[];
  completedCount: number;
  totalCount: number;
  progressPercentage: number;
  totalCalories: number;
  totalXp: number;
  activeIllnesses: string[];
}

const normalizeKey = (key: string): string => {
  return (key || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
};

/**
 * Generate 3 deterministic daily challenges for a given date based on user's active health/posture conditions.
 * Automatically computes real-time live progress and verification from AI Pose tracking.
 */
export function generateDailyChallenges(
  allExercises: ExerciseItem[],
  profile: UserProfile | null,
  dateStr?: string,
  completedMap: Record<string, boolean> = {},
  progressMap: Record<string, ExerciseLiveStats> = {}
): DailyChallengeSummary {
  const today = dateStr || toDateKey(new Date()); // YYYY-MM-DD
  if (!allExercises || allExercises.length === 0) {
    return {
      date: today,
      challenges: [],
      completedCount: 0,
      totalCount: 0,
      progressPercentage: 0,
      totalCalories: 0,
      totalXp: 0,
      activeIllnesses: [],
    };
  }

  // 1. Identify active user conditions
  const activeConditions: HealthConditionMeta[] = HEALTH_CONDITIONS.filter((cond) => {
    if (!profile) return false;
    if ((profile as any)[cond.field] === true) return true;
    if (profile.health_conditions && profile.health_conditions[cond.key] === true) return true;
    return false;
  });

  const activeIllnessTitles = activeConditions.map((c) => c.title);

  // Helper to find exercise by name or keyword
  const findEx = (nameKeyword: string): ExerciseItem => {
    const kw = nameKeyword.toLowerCase();
    const found = allExercises.find((e) => e.name.toLowerCase().includes(kw));
    return found || allExercises[0];
  };

  const challenges: DailyChallenge[] = [];

  // 2. Specific tailored challenges by illness condition
  if (activeConditions.length > 0) {
    const potentialPool: Array<{
      exercise: ExerciseItem;
      title: string;
      shortGoal: string;
      description: string;
      targetType: 'reps' | 'hold_seconds';
      targetValue: number;
      illnessKey: string;
      illnessTitle: string;
      cureBenefit: string;
      badgeColor: string;
      xpReward: number;
      calorieReward: number;
    }> = [];

    activeConditions.forEach((cond) => {
      switch (cond.key) {
        case 'lower_back_pain':
          potentialPool.push({
            exercise: findEx('child') || findEx('balasana'),
            title: 'Lumbar Spine Decompression',
            shortGoal: 'Hold for 60s',
            description: 'Relieves disc compression & elongates lower back extensors.',
            targetType: 'hold_seconds',
            targetValue: 60,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Decompresses L1-L5 lumbar vertebrae',
            badgeColor: cond.badgeColor,
            xpReward: 50,
            calorieReward: 35,
          });
          potentialPool.push({
            exercise: findEx('cobra') || findEx('bhujanga'),
            title: 'Spinal Extension & Flexibility',
            shortGoal: '10 Reps / 40s',
            description: 'Strengthens back erectors and restores natural lumbar curve.',
            targetType: 'reps',
            targetValue: 10,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Restores spinal lordosis & relieves stiffness',
            badgeColor: cond.badgeColor,
            xpReward: 45,
            calorieReward: 30,
          });
          potentialPool.push({
            exercise: findEx('crunch') || findEx('situp'),
            title: 'Core Stability Support',
            shortGoal: '15 Reps',
            description: 'Reinforces abdominal wall to take pressure off lower back.',
            targetType: 'reps',
            targetValue: 15,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Builds deep core brace for spine',
            badgeColor: cond.badgeColor,
            xpReward: 40,
            calorieReward: 25,
          });
          break;

        case 'knock_knees':
          potentialPool.push({
            exercise: findEx('lunge'),
            title: 'Knee Tracking & Balance Alignment',
            shortGoal: '16 Reps',
            description: 'Strengthens vastus medialis to prevent inward knee collapse.',
            targetType: 'reps',
            targetValue: 16,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Realigns patellar tracking & stabilizes hips',
            badgeColor: cond.badgeColor,
            xpReward: 50,
            calorieReward: 40,
          });
          potentialPool.push({
            exercise: findEx('triangle'),
            title: 'Hip Abductor & Lateral Strength',
            shortGoal: 'Hold for 45s',
            description: 'Opens tight groins and aligns femur angle with pelvis.',
            targetType: 'hold_seconds',
            targetValue: 45,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Strengthens outer hips & realigns knees',
            badgeColor: cond.badgeColor,
            xpReward: 45,
            calorieReward: 30,
          });
          potentialPool.push({
            exercise: findEx('squat'),
            title: 'Symmetrical Knee Alignment',
            shortGoal: '15 Reps',
            description: 'Reinforces proper hip-knee-ankle kinematic chain.',
            targetType: 'reps',
            targetValue: 15,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Eliminates inward knee valgus drift',
            badgeColor: cond.badgeColor,
            xpReward: 40,
            calorieReward: 35,
          });
          break;

        case 'bow_legs':
          potentialPool.push({
            exercise: findEx('lunge'),
            title: 'Adductor & Inner Thigh Loading',
            shortGoal: '16 Reps',
            description: 'Engages inner thighs to reduce lateral outward knee gap.',
            targetType: 'reps',
            targetValue: 16,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Tones adductors to correct genu varum',
            badgeColor: cond.badgeColor,
            xpReward: 50,
            calorieReward: 40,
          });
          potentialPool.push({
            exercise: findEx('child') || findEx('cobra'),
            title: 'Lateral Knee Pressure Relief',
            shortGoal: 'Hold for 50s',
            description: 'Decompresses outer knee joints and balances pelvis tilt.',
            targetType: 'hold_seconds',
            targetValue: 50,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Relieves lateral joint pressure & stiffness',
            badgeColor: cond.badgeColor,
            xpReward: 45,
            calorieReward: 30,
          });
          potentialPool.push({
            exercise: findEx('crunch'),
            title: 'Pelvic Neutral Alignment',
            shortGoal: '18 Reps',
            description: 'Strengthens pelvic floor and lower core stabilizers.',
            targetType: 'reps',
            targetValue: 18,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Stabilizes pelvic tilt to straighten legs',
            badgeColor: cond.badgeColor,
            xpReward: 40,
            calorieReward: 25,
          });
          break;

        case 'rounded_shoulders':
          potentialPool.push({
            exercise: findEx('cobra'),
            title: 'Scapular Retraction & Chest Opening',
            shortGoal: '10 Reps / 40s',
            description: 'Expands tight pectorals and pulls forward shoulders back.',
            targetType: 'reps',
            targetValue: 10,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Opens chest & pulls shoulders backward',
            badgeColor: cond.badgeColor,
            xpReward: 50,
            calorieReward: 30,
          });
          potentialPool.push({
            exercise: findEx('push') || findEx('pushup'),
            title: 'Serratus & Upper Back Push',
            shortGoal: '12 Reps',
            description: 'Strengthens rhomboids and mid-back scapular anchors.',
            targetType: 'reps',
            targetValue: 12,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Strengthens shoulder blade stabilizers',
            badgeColor: cond.badgeColor,
            xpReward: 45,
            calorieReward: 35,
          });
          potentialPool.push({
            exercise: findEx('child') || findEx('triangle'),
            title: 'Thoracic Mobility & Lat Stretch',
            shortGoal: 'Hold for 50s',
            description: 'Stretches tight lats and unslouches upper spine.',
            targetType: 'hold_seconds',
            targetValue: 50,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Reverses forward slouched posture',
            badgeColor: cond.badgeColor,
            xpReward: 40,
            calorieReward: 25,
          });
          break;

        case 'flat_feet':
          potentialPool.push({
            exercise: findEx('lunge'),
            title: 'Arch & Ankle Kinetic Activation',
            shortGoal: '15 Reps',
            description: 'Builds foot tripod balance and posterior tibial strength.',
            targetType: 'reps',
            targetValue: 15,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Strengthens ankle & foot arch support',
            badgeColor: cond.badgeColor,
            xpReward: 50,
            calorieReward: 35,
          });
          potentialPool.push({
            exercise: findEx('child') || findEx('squat'),
            title: 'Ankle Dorsiflexion & Plantar Stretch',
            shortGoal: 'Hold for 45s',
            description: 'Elongates plantar fascia and balances Achilles tendon load.',
            targetType: 'hold_seconds',
            targetValue: 45,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Restores natural arch flexibility',
            badgeColor: cond.badgeColor,
            xpReward: 45,
            calorieReward: 30,
          });
          potentialPool.push({
            exercise: findEx('push') || findEx('pushup'),
            title: 'Plank Kinetic Chain Stability',
            shortGoal: '12 Reps',
            description: 'Strengthens total kinetic chain from toes to shoulders.',
            targetType: 'reps',
            targetValue: 12,
            illnessKey: cond.key,
            illnessTitle: cond.title,
            cureBenefit: 'Reinforces full-body weight distribution',
            badgeColor: cond.badgeColor,
            xpReward: 40,
            calorieReward: 30,
          });
          break;
      }
    });

    // Select distinct exercises to ensure variety in the 3 daily quests
    const selectedExIds = new Set<string>();
    for (const item of potentialPool) {
      if (challenges.length >= 3) break;
      if (!selectedExIds.has(item.exercise.id)) {
        selectedExIds.add(item.exercise.id);
        const challengeId = `daily_${today}_${item.exercise.id}_${item.illnessKey}`;

        const idKey = String(item.exercise.id);
        const nameKey = normalizeKey(item.exercise.name);
        const memoryStats = progressMap[idKey] || progressMap[nameKey] || { reps: 0, holdSeconds: 0 };
        const dbStats = (profile?.daily_challenges?.[today]?.progress?.[idKey]) || (profile?.daily_challenges?.[today]?.progress?.[nameKey]) || { reps: 0, holdSeconds: 0 };
        const mergedReps = Math.max(memoryStats.reps || 0, dbStats.reps || 0);
        const mergedHold = Math.max(memoryStats.holdSeconds || 0, dbStats.holdSeconds || 0);
        const rawProgress = item.targetType === 'hold_seconds' ? mergedHold : mergedReps;
        const isAiVerified = rawProgress >= item.targetValue;
        const isCompleted = isAiVerified;
        const currentProgress = isCompleted ? item.targetValue : rawProgress;

        challenges.push({
          id: challengeId,
          exerciseId: item.exercise.id,
          exerciseName: item.exercise.name,
          exercise: item.exercise,
          title: item.title,
          shortGoal: item.shortGoal,
          description: item.description,
          targetType: item.targetType,
          targetValue: item.targetValue,
          currentProgress,
          isCompleted,
          isAiVerified,
          illnessKey: item.illnessKey,
          illnessTitle: item.illnessTitle,
          cureBenefit: item.cureBenefit,
          badgeColor: item.badgeColor,
          xpReward: item.xpReward,
          calorieReward: item.calorieReward,
          category: item.exercise.category,
        });
      }
    }
  }

  // 3. Fallback / General Daily Posture & Longevity Quests if < 3 challenges
  if (challenges.length < 3) {
    const generalPool = [
      {
        exercise: findEx('child') || findEx('balasana'),
        title: 'Spinal Decompression & Relaxation',
        shortGoal: 'Hold for 50s',
        description: 'Relieves lumbar vertebrae tension and stretches shoulder blades.',
        targetType: 'hold_seconds' as const,
        targetValue: 50,
        cureBenefit: 'Daily spine decompression & relaxation',
        badgeColor: '#10B981',
        xpReward: 45,
        calorieReward: 30,
      },
      {
        exercise: findEx('squat'),
        title: 'Lower Body Strength & Symmetry',
        shortGoal: '15 Reps',
        description: 'Parallel depth knee-tracking for glute & quad power.',
        targetType: 'reps' as const,
        targetValue: 15,
        cureBenefit: 'Functional knee stability & posture',
        badgeColor: '#6366F1',
        xpReward: 50,
        calorieReward: 40,
      },
      {
        exercise: findEx('triangle') || findEx('lunge'),
        title: 'Full Body Mobility & Balance',
        shortGoal: 'Hold for 40s',
        description: 'Opens lateral hips and balances core kinetic stability.',
        targetType: 'hold_seconds' as const,
        targetValue: 40,
        cureBenefit: 'Joint mobility & kinetic balance',
        badgeColor: '#F59E0B',
        xpReward: 45,
        calorieReward: 30,
      },
      {
        exercise: findEx('cobra'),
        title: 'Chest Expansion & Spine Awakening',
        shortGoal: '10 Reps',
        description: 'Reverses forward slouched posture and strengthens upper back.',
        targetType: 'reps' as const,
        targetValue: 10,
        cureBenefit: 'Posture correction & upright alignment',
        badgeColor: '#EC4899',
        xpReward: 45,
        calorieReward: 25,
      },
    ];

    for (const g of generalPool) {
      if (challenges.length >= 3) break;
      if (!challenges.some((c) => c.exerciseId === g.exercise.id)) {
        const challengeId = `daily_${today}_${g.exercise.id}_gen`;

        const idKey = String(g.exercise.id);
        const nameKey = normalizeKey(g.exercise.name);
        const memoryStats = progressMap[idKey] || progressMap[nameKey] || { reps: 0, holdSeconds: 0 };
        const dbStats = (profile?.daily_challenges?.[today]?.progress?.[idKey]) || (profile?.daily_challenges?.[today]?.progress?.[nameKey]) || { reps: 0, holdSeconds: 0 };
        const mergedReps = Math.max(memoryStats.reps || 0, dbStats.reps || 0);
        const mergedHold = Math.max(memoryStats.holdSeconds || 0, dbStats.holdSeconds || 0);
        const rawProgress = g.targetType === 'hold_seconds' ? mergedHold : mergedReps;
        const isAiVerified = rawProgress >= g.targetValue;
        const isCompleted = isAiVerified;
        const currentProgress = isCompleted ? g.targetValue : rawProgress;

        challenges.push({
          id: challengeId,
          exerciseId: g.exercise.id,
          exerciseName: g.exercise.name,
          exercise: g.exercise,
          title: g.title,
          shortGoal: g.shortGoal,
          description: g.description,
          targetType: g.targetType,
          targetValue: g.targetValue,
          currentProgress,
          isCompleted,
          isAiVerified,
          illnessTitle: 'General Posture & Spine',
          cureBenefit: g.cureBenefit,
          badgeColor: g.badgeColor,
          xpReward: g.xpReward,
          calorieReward: g.calorieReward,
          category: g.exercise.category,
        });
      }
    }
  }

  const completedCount = challenges.filter((c) => c.isCompleted).length;
  const totalCount = challenges.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalCalories = challenges.reduce((acc, c) => acc + c.calorieReward, 0);
  const totalXp = challenges.reduce((acc, c) => acc + c.xpReward, 0);

  return {
    date: today,
    challenges,
    completedCount,
    totalCount,
    progressPercentage,
    totalCalories,
    totalXp,
    activeIllnesses: activeIllnessTitles,
  };
}
