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
    icon: '🦵',
    badgeColor: '#EC4899',
    question: 'Do your knees turn inward or touch each other when standing upright?',
    shortDesc: 'Inward knee tilt & weak hip abductors',
    benefitTag: 'Knee & Hip Alignment',
    recommendedExerciseNames: ['Triangle Pose', 'Lunges', 'Squats'],
    cautionExerciseNames: [],
    explanation:
      'Targeted hip abductor (gluteus medius) and vastus medialis activation realigns knee tracking and prevents inward joint collapse.',
  },
  {
    key: 'bow_legs',
    field: 'has_bow_legs',
    title: 'Bow Legs',
    medicalTerm: 'Genu Varum',
    icon: '🧘',
    badgeColor: '#8B5CF6',
    question: 'Is there a noticeable outward space between your knees when your ankles touch?',
    shortDesc: 'Outward knee curvature & lateral tension',
    benefitTag: 'Adductor & Joint Correction',
    recommendedExerciseNames: ['Lunges', 'Cobra Pose', 'Squats', 'Crunches'],
    cautionExerciseNames: [],
    explanation:
      'Strengthens hip adductors and core stabilizers to reduce excess lateral knee compression and restore vertical leg symmetry.',
  },
  {
    key: 'flat_feet',
    field: 'has_flat_feet',
    title: 'Flat Feet',
    medicalTerm: 'Pes Planus',
    icon: '🦶',
    badgeColor: '#3B82F6',
    question: 'Do you have low, flat, or collapsed foot arches when standing?',
    shortDesc: 'Arch pronation & kinetic chain imbalance',
    benefitTag: 'Arch & Kinetic Chain',
    recommendedExerciseNames: ['Cobra Pose', 'Push-ups', 'Lunges'],
    cautionExerciseNames: [],
    explanation:
      'Promotes whole-body kinetic chain stability, activates intrinsic foot arch muscles, and supports ankle alignment.',
  },
  {
    key: 'lower_back_pain',
    field: 'has_lower_back_pain',
    title: 'Lower Back Pain',
    medicalTerm: 'Lumbar Strain / Stiffness',
    icon: '🩹',
    badgeColor: '#F59E0B',
    question: 'Do you experience frequent lower back tightness, stiffness, or aching?',
    shortDesc: 'Lumbar tension & tight hip flexors',
    benefitTag: 'Spine Decompression',
    recommendedExerciseNames: ['Cobra Pose', 'Triangle Pose', 'Crunches', 'Push-ups'],
    cautionExerciseNames: ['Sit-ups'],
    explanation:
      'Gently decompresses lumbar vertebrae, stretches hip flexors, and builds a protective core brace without spinal shearing.',
  },
  {
    key: 'rounded_shoulders',
    field: 'has_rounded_shoulders',
    title: 'Rounded Shoulders',
    medicalTerm: 'Upper Cross Syndrome',
    icon: '📐',
    badgeColor: '#10B981',
    question: 'Do your shoulders roll forward or do you experience upper spine fatigue?',
    shortDesc: 'Forward shoulder tilt & tight chest',
    benefitTag: 'Scapular Retraction',
    recommendedExerciseNames: ['Cobra Pose', 'Triangle Pose', 'Push-ups'],
    cautionExerciseNames: [],
    explanation:
      'Opens the chest, activates rhomboids, lower trapezius, and serratus anterior for an upright posture.',
  },
];

export interface RecommendedExercise extends ExerciseItem {
  recommendationScore: number;
  conditionTags: { title: string; color: string; tag: string }[];
  primaryReason: string;
  isCustomTailored: boolean;
}

/**
 * Computes personalized exercise recommendations based on user's active health/posture conditions.
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

  // Build recommendation scoring for each exercise
  const scoredList: RecommendedExercise[] = allExercises.map((ex) => {
    let score = 0;
    const conditionTags: { title: string; color: string; tag: string }[] = [];
    const reasonParts: string[] = [];

    activeConditions.forEach((cond) => {
      const isRecommended = cond.recommendedExerciseNames.some(
        (name) => name.toLowerCase() === ex.name.toLowerCase()
      );
      const isCautioned = cond.cautionExerciseNames?.some(
        (name) => name.toLowerCase() === ex.name.toLowerCase()
      );

      if (isRecommended) {
        score += 10;
        conditionTags.push({
          title: cond.title,
          color: cond.badgeColor,
          tag: cond.benefitTag,
        });
        reasonParts.push(`Recommended for ${cond.title}: ${cond.shortDesc}`);
      }

      if (isCautioned) {
        score -= 5;
      }
    });

    // Default baseline scoring if user has no conditions
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
