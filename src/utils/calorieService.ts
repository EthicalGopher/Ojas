/**
 * Calorie Service
 * Provides accurate real-time calorie burn calculations across all exercises and modes
 * (Quick Start, AI Tutor, 1v1 Arena, Faceoff, FFA, Solo Training).
 */

export function calculateExerciseCalories(
  exerciseIdOrName?: string,
  reps: number = 0,
  holdSeconds: number = 0
): number {
  const identifier = (exerciseIdOrName || '').toLowerCase().trim();

  let repRate = 0.35; // kcal per rep
  let holdRate = 0.10; // kcal per second of isometric hold

  if (identifier === '7' || identifier.includes('push')) {
    repRate = 0.45;
    holdRate = 0.12;
  } else if (identifier === '2' || identifier === '5' || identifier.includes('sit') || identifier.includes('crunch')) {
    repRate = 0.30;
    holdRate = 0.08;
  } else if (identifier === '4' || identifier.includes('lunge')) {
    repRate = 0.38;
    holdRate = 0.10;
  } else if (
    identifier === '3' ||
    identifier === '6' ||
    identifier === '8' ||
    identifier.includes('triangle') ||
    identifier.includes('trikon') ||
    identifier.includes('cobra') ||
    identifier.includes('bhujanga') ||
    identifier.includes('child') ||
    identifier.includes('balasana')
  ) {
    repRate = 0.40;
    holdRate = 0.12;
  } else if (identifier === '1' || identifier.includes('squat')) {
    repRate = 0.35;
    holdRate = 0.10;
  }

  const rawBurn = (Math.max(0, reps) * repRate) + (Math.max(0, holdSeconds) * holdRate);
  return Math.round(rawBurn * 10) / 10;
}
