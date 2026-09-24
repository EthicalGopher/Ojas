-- =============================================================================
-- Migration: Add Tree Pose (Vrikshasana) to public.exercises
-- Description: Single-leg balance pose tracked by the MediaPipe geometry engine
--              and cross-checked by the ResNet50 image classifier
--              (backend/Pose/tree_pose).
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
  '9',
  'Tree Pose',
  'flexibility',
  '🌳',
  'AI Real-time Vrikshasana Balance Tracker: MediaPipe geometry cross-checked by an image classifier',
  '#A7F3D0',
  true,
  9,
  15,
  'Ankles / Calves / Thighs / Core / Hip Openers',
  10,
  'Beginner',
  '#A7F3D0',
  'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/a-female-doing-yoga.svg',
  'Yoga',
  ARRAY['flat_feet', 'knock_knees', 'bow_legs', 'rounded_shoulders']
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
