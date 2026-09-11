import { ExerciseItem } from './exerciseService';
import { UserProfile } from './profileService';

export interface HealthConditionMeta {
  key: string;
  field: keyof UserProfile;
  title: string;
  medicalTerm: string;
  icon: string;
  badgeColor: string;
  question: string;
  shortDesc: string;
  benefitTag: string;
  recommendedExerciseNames: string[];
  cautionExerciseNames?: string[];
  explanation: string;
}

export const HEALTH_CONDITIONS: HealthConditionMeta[] = [
  {
    key: 'knock_knees',
    field: 'has_knock_knees',
    title: 'Knock Knees',
    medicalTerm: 'Genu Valgum',
    icon: '',
    badgeColor: '#E25822',
    question: 'Do your knees turn inward or touch each other when standing upright?',
    shortDesc: 'Inward knee tracking & weak abductors',
    benefitTag: 'Knee & Hip Alignment',
    recommendedExerciseNames: ['Triangle Pose', 'Lunges', 'Squats', "Child's Pose"],
    cautionExerciseNames: [],
    explanation:
      'Hip abductor and vastus medialis strengthening realigns knee tracking and stabilizes pelvic angle.',
  },
  {
    key: 'bow_legs',
    field: 'has_bow_legs',
    title: 'Bow Legs',
    medicalTerm: 'Genu Varum',
    icon: '',
    badgeColor: '#8B5CF6',
    question: 'Do your knees curve outward with a gap when your ankles touch?',
    shortDesc: 'Outward knee curve & lateral load',
    benefitTag: 'Adductor & Joint Alignment',
    recommendedExerciseNames: ['Lunges', 'Cobra Pose', 'Squats', 'Crunches', "Child's Pose"],
    cautionExerciseNames: [],
    explanation:
      'Strengthens hip adductors and core stabilizers to reduce lateral knee compression.',
  },
  {
    key: 'flat_feet',
    field: 'has_flat_feet',
    title: 'Flat Feet',
    medicalTerm: 'Pes Planus',
    icon: '',
    badgeColor: '#3B82F6',
    question: 'Do you have flat or collapsed foot arches when standing?',
    shortDesc: 'Arch pronation & ankle imbalance',
    benefitTag: 'Arch & Ankle Stability',
    recommendedExerciseNames: ['Cobra Pose', 'Push-ups', 'Lunges', "Child's Pose"],
    cautionExerciseNames: [],
    explanation:
      'Builds kinetic chain stability, activating foot arches and ankle stabilizers.',
  },
  {
    key: 'lower_back_pain',
    field: 'has_lower_back_pain',
    title: 'Lower Back Pain',
    medicalTerm: 'Lumbar Strain',
    icon: '',
    badgeColor: '#F59E0B',
    question: 'Do you experience lower back stiffness, tightness, or pain?',
    shortDesc: 'Lumbar tension & tight hip flexors',
    benefitTag: 'Spine Decompression',
    recommendedExerciseNames: ['Cobra Pose', 'Triangle Pose', 'Crunches', 'Push-ups', "Child's Pose"],
    cautionExerciseNames: ['Sit-ups'],
    explanation:
      'Decompresses lumbar vertebrae, opens hip flexors, and reinforces deep core support.',
  },
  {
    key: 'rounded_shoulders',
    field: 'has_rounded_shoulders',
    title: 'Rounded Shoulders',
    medicalTerm: 'Upper Cross Syndrome',
    icon: '',
    badgeColor: '#10B981',
    question: 'Do your shoulders roll forward or slouch when standing?',
    shortDesc: 'Forward shoulder tilt & tight chest',
    benefitTag: 'Scapular Retraction',
    recommendedExerciseNames: ['Cobra Pose', 'Triangle Pose', 'Push-ups', "Child's Pose"],
    cautionExerciseNames: [],
    explanation:
      'Opens anterior chest muscles, strengthens rhomboids and upper back stabilizers.',
  },
];

export interface RecommendedExercise extends ExerciseItem {
  recommendationScore: number;
  conditionTags: { title: string; color: string; tag: string }[];
  primaryReason: string;
  isCustomTailored: boolean;
}

/**
 * Helper to get recommended exercises for a specific condition key based on cure_to column
 */
export function getRecommendedExercisesForCondition(
  conditionKey: string,
  allExercises: ExerciseItem[]
): ExerciseItem[] {
  if (!allExercises || allExercises.length === 0) return [];

  const keyLower = conditionKey.toLowerCase();
  const normalizedKey = keyLower.replace(/_/g, ' ');

  // Primary: Match exercises where cure_to array contains the condition key or title
  const matches = allExercises.filter((ex) => {
    if (Array.isArray(ex.cure_to) && ex.cure_to.length > 0) {
      return ex.cure_to.some((ct) => {
        const ctLower = (ct || '').toLowerCase();
        return (
          ctLower === keyLower ||
          ctLower.replace(/_/g, ' ') === normalizedKey ||
          ctLower.includes(keyLower) ||
          keyLower.includes(ctLower)
        );
      });
    }
    return false;
  });

  if (matches.length > 0) {
    return matches;
  }

  // Fallback: Check static condition recommended names if cure_to is not populated
  const condMeta = HEALTH_CONDITIONS.find((c) => c.key === conditionKey);
  if (!condMeta) return [];

  return allExercises.filter((ex) =>
    condMeta.recommendedExerciseNames.some(
      (name) => name.toLowerCase() === ex.name.toLowerCase()
    )
  );
}

/**
 * Computes personalized exercise recommendations based on user's active health/posture conditions.
 * Uses the exercises table `cure_to` array as the primary source of truth.
 */
export function getRecommendedExercises(
  allExercises: ExerciseItem[],
  profile?: UserProfile | null
): {
  recommendedList: RecommendedExercise[];
  activeConditions: HealthConditionMeta[];
  hasAnyCondition: boolean;
} {
  if (!allExercises || allExercises.length === 0) {
    return { recommendedList: [], activeConditions: [], hasAnyCondition: false };
  }

  // Find all active conditions for this user
  const activeConditions: HealthConditionMeta[] = HEALTH_CONDITIONS.filter((cond) => {
    if (!profile) return false;
    // Check direct boolean field
    if ((profile as any)[cond.field] === true) return true;
    // Check nested health_conditions map
    if (profile.health_conditions && profile.health_conditions[cond.key] === true) return true;
    return false;
  });

  const hasAnyCondition = activeConditions.length > 0;

  // Build recommendation scoring for each exercise based on cure_to
  const scoredList: RecommendedExercise[] = allExercises.map((ex) => {
    let score = 0;
    const conditionTags: { title: string; color: string; tag: string }[] = [];
    const reasonParts: string[] = [];

    activeConditions.forEach((cond) => {
      const keyLower = cond.key.toLowerCase();
      const normalizedKey = keyLower.replace(/_/g, ' ');

      // 1. Check cure_to array from exercises table
      const matchesCureTo =
        Array.isArray(ex.cure_to) &&
        ex.cure_to.some((ct) => {
          const ctLower = (ct || '').toLowerCase();
          return (
            ctLower === keyLower ||
            ctLower.replace(/_/g, ' ') === normalizedKey ||
            ctLower === cond.title.toLowerCase() ||
            ctLower === cond.medicalTerm.toLowerCase() ||
            ctLower.includes(keyLower) ||
            keyLower.includes(ctLower)
          );
        });

      // 2. Fallback check by name if cure_to wasn't set
      const isStaticFallback = cond.recommendedExerciseNames.some(
        (name) => name.toLowerCase() === ex.name.toLowerCase()
      );

      const isRecommended = matchesCureTo || isStaticFallback;
      const isCautioned = cond.cautionExerciseNames?.some(
        (name) => name.toLowerCase() === ex.name.toLowerCase()
      );

      if (isRecommended) {
        // Boost score higher if directly in cure_to array
        score += matchesCureTo ? 20 : 10;
        conditionTags.push({
          title: cond.title,
          color: cond.badgeColor,
          tag: cond.benefitTag,
        });
        reasonParts.push(`Cures ${cond.title}: ${cond.benefitTag}`);
      }

      if (isCautioned) {
        score -= 8;
      }
    });

    // Baseline scoring if user has no conditions
    if (!hasAnyCondition) {
      if (ex.category === 'strength') score += 5;
      if (ex.category === 'flexibility') score += 5;
    }

    return {
      ...ex,
      recommendationScore: score,
      conditionTags,
      primaryReason:
        reasonParts.length > 0
          ? reasonParts.join(' • ')
          : 'Great for full-body strength, mobility, and cardiovascular health.',
      isCustomTailored: score > 0 && hasAnyCondition,
    };
  });

  // Sort highest score first, keeping custom tailored at top
  scoredList.sort((a, b) => {
    if (b.recommendationScore !== a.recommendationScore) {
      return b.recommendationScore - a.recommendationScore;
    }
    return (a.name || '').localeCompare(b.name || '');
  });

  return {
    recommendedList: scoredList,
    activeConditions,
    hasAnyCondition,
  };
}
