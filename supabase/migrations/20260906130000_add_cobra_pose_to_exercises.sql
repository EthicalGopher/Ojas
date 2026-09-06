-- =============================================================================
-- Migration: Add Cobra Pose (Bhujangasana) to public.exercises table
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
  image_url
)
VALUES (
  '6',
  'Cobra Pose',
  'flexibility',
  '🐍',
  'AI Real-time Bhujangasana Pose Tracker for Pelvis Grounding, Chest Elevation & Spine Flexibility',
  '#A7F3D0',
  true,
  6,
  15,
  'Spine Extensors / Chest / Shoulders / Abdominals',
  10,
  'Beginner',
  '#A7F3D0',
  'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/a-female-doing-yoga.svg'
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
  updated_at = NOW();
