-- =============================================================================
-- Migration: Add Warrior II (Virabhadrasana II) to public.exercises
-- Description: Wide-lunge standing balance pose tracked by MediaPipe geometry
--              and cross-checked by the ResNet50 vision classifier
--              (backend/Pose/warrior_pose).
-- =============================================================================

INSERT INTO public.exercises (
  id,
  name,
  category,
  icon,
  description,
  bg_gradient,
  is_active,
  display_order,
  duration_mins,
  muscle_groups,
  reps_target,
  difficulty,
  bg_theme,
  image_url,
  type,
  cure_to
)
VALUES (
  '10',
  'Warrior II',
  'flexibility',
  '⚔️',
  'AI Real-time Virabhadrasana II Lunge & Balance Tracker: MediaPipe geometry cross-checked by an image classifier',
  '#FFD6E0',
  true,
  10,
  15,
  'Hips / Groin / Shoulders / Core / Quads',
  10,
  'Intermediate',
  '#FFD6E0',
  'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/a-female-doing-yoga.svg',
  'Yoga',
  ARRAY['flat_feet', 'knock_knees', 'scoliosis', 'rounded_shoulders']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  bg_gradient = EXCLUDED.bg_gradient,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  duration_mins = EXCLUDED.duration_mins,
  muscle_groups = EXCLUDED.muscle_groups,
  reps_target = EXCLUDED.reps_target,
  difficulty = EXCLUDED.difficulty,
  bg_theme = EXCLUDED.bg_theme,
  image_url = EXCLUDED.image_url,
  type = EXCLUDED.type,
  cure_to = EXCLUDED.cure_to;
