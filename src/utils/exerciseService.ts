import { supabase } from './supabase';

export interface ExerciseItem {
  id: string;
  name: string;
  category: 'all' | 'strength' | 'cardio' | 'flexibility';
  icon: string;
  description?: string;
  bgGradient?: string;
  isFavorite?: boolean;
  duration_mins?: number;
  muscle_groups?: string;
  reps_target?: number;
  difficulty?: string;
  bg_theme?: string;
  image_url?: string;
  type?: string;
  cure_to?: string[];
}

export const DEFAULT_EXERCISES: ExerciseItem[] = [
  {
    id: '1',
    name: 'Squats',
    category: 'strength',
    icon: '🏋️',
    description: 'AI Real-time MediaPipe Pose Tracker for Parallel Depth & Rep Counting',
    bgGradient: '#C8B6FF',
    isFavorite: true,
    duration_mins: 25,
    muscle_groups: 'Glutes / Quads / Hamstrings',
    reps_target: 15,
    difficulty: 'Intermediate',
    bg_theme: '#C8B6FF',
    type: 'Common exercises',
    cure_to: ['knock_knees', 'bow_legs', 'flat_feet'],
  },
  {
    id: '3',
    name: 'Triangle Pose',
    category: 'flexibility',
    icon: '📐',
    description: 'AI Real-time Trikonasana Pose Tracker for Leg Extension, Lateral Hinge & Hold Time',
    bgGradient: '#A7F3D0',
    isFavorite: true,
    duration_mins: 20,
    muscle_groups: 'Hamstrings / Groin / Hips / Core',
    reps_target: 10,
    difficulty: 'Beginner',
    bg_theme: '#A7F3D0',
    type: 'Yoga',
    cure_to: ['bow_legs', 'lower_back_pain', 'rounded_shoulders'],
  },
  {
    id: '4',
    name: 'Lunges',
    category: 'strength',
    icon: '🦵',
    description: 'Unilateral lead-leg tracking, knee angle depth & balance analyzer',
    bgGradient: '#FFD6E0',
    isFavorite: true,
    duration_mins: 22,
    muscle_groups: 'Quads / Glutes / Calves',
    reps_target: 16,
    difficulty: 'Intermediate',
    bg_theme: '#FFD6E0',
    type: 'Common exercises',
    cure_to: ['knock_knees', 'bow_legs', 'flat_feet'],
  },
  {
    id: '5',
    name: 'Crunches',
    category: 'flexibility',
    icon: '🧘',
    description: 'Abdominal flexion & shoulder blade elevation core tracker',
    bgGradient: '#E8D5C4',
    isFavorite: true,
    duration_mins: 18,
    muscle_groups: 'Upper Abs / Core / Obliques',
    reps_target: 20,
    difficulty: 'Beginner',
    bg_theme: '#E8D5C4',
    type: 'Common exercises',
    cure_to: ['bow_legs', 'lower_back_pain'],
  },
  {
    id: '2',
    name: 'Sit-ups',
    category: 'strength',
    icon: '💪',
    description: 'Full torso elevation & hip flexion complete core tracker',
    bgGradient: '#C8B6FF',
    isFavorite: true,
    duration_mins: 20,
    muscle_groups: 'Abdominals / Hip Flexors / Core',
    reps_target: 15,
    difficulty: 'Intermediate',
    bg_theme: '#C8B6FF',
    type: 'Common exercises',
    cure_to: ['lower_back_pain'],
  },
  {
    id: '6',
    name: 'Cobra Pose',
    category: 'flexibility',
    icon: '🐍',
    description: 'AI Real-time Bhujangasana Pose Tracker for Pelvis Grounding, Chest Elevation & Spine Flexibility',
    bgGradient: '#A7F3D0',
    isFavorite: true,
    duration_mins: 15,
    muscle_groups: 'Spine Extensors / Chest / Shoulders / Abdominals',
    reps_target: 10,
    difficulty: 'Beginner',
    bg_theme: '#A7F3D0',
    image_url: 'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/a-female-doing-yoga.svg',
    type: 'Yoga',
    cure_to: ['bow_legs', 'flat_feet', 'lower_back_pain', 'rounded_shoulders'],
  },
  {
    id: '7',
    name: 'Push-ups',
    category: 'strength',
    icon: '🤸',
    description: 'AI Real-time Push-up Depth, Elbow Flexion & Plank Alignment Rep Tracker',
    bgGradient: '#FFD6E0',
    isFavorite: true,
    duration_mins: 20,
    muscle_groups: 'Chest / Triceps / Shoulders / Core',
    reps_target: 15,
    difficulty: 'Intermediate',
    bg_theme: '#FFD6E0',
    image_url: 'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/a-guy-doing-pushups.svg',
    type: 'Common exercises',
    cure_to: ['flat_feet', 'lower_back_pain', 'rounded_shoulders'],
  },
  {
    id: '8',
    name: "Child's Pose",
    category: 'flexibility',
    icon: '🧘',
    description: 'AI Real-time Balasana Pose Tracker for Spine Decompression, Hip Flexion & Shoulder Stretch',
    bgGradient: '#A7F3D0',
    isFavorite: true,
    duration_mins: 15,
    muscle_groups: 'Spine Decompressors / Glutes / Ankles / Shoulders',
    reps_target: 10,
    difficulty: 'Beginner',
    bg_theme: '#A7F3D0',
    image_url: 'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/child_pose.png',
    type: 'Yoga',
    cure_to: ['lower_back_pain', 'rounded_shoulders', 'bow_legs', 'flat_feet', 'knock_knees'],
  },
];

export async function fetchExercisesFromSupabase(): Promise<ExerciseItem[]> {
  try {
    // Fast 1.5s timeout promise so offline/airplane mode never hangs
    const fetchWithTimeout = Promise.race([
      supabase
        .from('exercises')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true }),
      new Promise<{ data: null; error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error('Network timeout - offline')), 1500)
      ),
    ]);

    const { data, error } = await fetchWithTimeout;

    if (error) {
      return DEFAULT_EXERCISES;
    }

    if (data && data.length > 0) {
      return data.map((row: any) => ({
        id: String(row.id),
        name: row.name,
        category: row.category as ExerciseItem['category'],
        icon: row.icon || '🏋️',
        description: row.description || '',
        bgGradient: row.bg_gradient || row.bg_theme || '#C8B6FF',
        isFavorite: true,
        duration_mins: row.duration_mins || 30,
        muscle_groups: row.muscle_groups || 'Glutes / Squats / Core',
        reps_target: row.reps_target || 15,
        difficulty: row.difficulty || 'Intermediate',
        bg_theme: row.bg_theme || row.bg_gradient || '#C8B6FF',
        image_url: row.image_url || undefined,
        type: row.type || (row.category === 'flexibility' ? 'Yoga' : 'Common exercises'),
        cure_to: Array.isArray(row.cure_to) ? row.cure_to : [],
      }));
    }

    return DEFAULT_EXERCISES;
  } catch (err: any) {
    // Return default exercises immediately when offline or timed out
    return DEFAULT_EXERCISES;
  }
}
